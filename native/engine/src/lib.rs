use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, BufRead, Read, Write};

pub const PROTOCOL_VERSION: u64 = 1;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    #[serde(rename = "protocolVersion")]
    protocol_version: u64,
    id: String,
    method: String,
    params: EmptyParams,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyParams {}

fn failure(id: Value, code: &str, message: &str) -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "id": id,
        "ok": false,
        "error": { "code": code, "message": message }
    })
}

pub fn handle_frame(bytes: &[u8]) -> Value {
    let request = match serde_json::from_slice::<Request>(bytes) {
        Ok(request)
            if !request.id.is_empty()
                && request.id.chars().count() <= 64
                && !request.method.is_empty()
                && request.method.chars().count() <= 64 =>
        {
            request
        }
        _ => return failure(Value::Null, "INVALID_REQUEST", "Invalid request envelope."),
    };

    // Deserialize params even though this first method takes no arguments.
    let _ = request.params;
    let id = Value::String(request.id);
    if request.protocol_version != PROTOCOL_VERSION {
        return failure(id, "PROTOCOL_MISMATCH", "Unsupported protocol version.");
    }
    if request.method != "engine.version" {
        return failure(id, "UNKNOWN_METHOD", "Unsupported engine method.");
    }

    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "id": id,
        "ok": true,
        "result": {
            "engineVersion": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH
        }
    })
}

pub fn serve(mut input: impl BufRead, mut output: impl Write) -> io::Result<()> {
    loop {
        let mut frame = Vec::new();
        let read = input
            .by_ref()
            .take((MAX_FRAME_BYTES + 1) as u64)
            .read_until(b'\n', &mut frame)?;
        if read == 0 {
            return Ok(());
        }
        let oversized = frame.len() > MAX_FRAME_BYTES;
        let response = if oversized {
            failure(
                Value::Null,
                "FRAME_TOO_LARGE",
                "Request exceeds 16384 bytes.",
            )
        } else {
            handle_frame(&frame)
        };
        serde_json::to_writer(&mut output, &response)?;
        output.write_all(b"\n")?;
        output.flush()?;
        // End a malformed stream instead of interpreting its remaining bytes as requests.
        if oversized {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn request() -> Value {
        json!({ "protocolVersion": 1, "id": "test", "method": "engine.version", "params": {} })
    }

    #[test]
    fn returns_version_with_matching_request_id() {
        let response = handle_frame(request().to_string().as_bytes());
        assert_eq!(response["id"], "test");
        assert_eq!(response["ok"], true);
        assert_eq!(
            response["result"]["engineVersion"],
            env!("CARGO_PKG_VERSION")
        );
    }

    #[test]
    fn rejects_incompatible_protocol() {
        let mut input = request();
        input["protocolVersion"] = json!(2);
        assert_eq!(
            handle_frame(input.to_string().as_bytes())["error"]["code"],
            "PROTOCOL_MISMATCH"
        );
    }

    #[test]
    fn rejects_unknown_methods() {
        let mut input = request();
        input["method"] = json!("delete.everything");
        assert_eq!(
            handle_frame(input.to_string().as_bytes())["error"]["code"],
            "UNKNOWN_METHOD"
        );
    }

    #[test]
    fn rejects_extra_fields_and_invalid_input() {
        let mut input = request();
        input["params"] = json!({ "command": "whoami" });
        for bytes in [
            input.to_string().into_bytes(),
            b"not json".to_vec(),
            vec![255],
        ] {
            assert_eq!(handle_frame(&bytes)["error"]["code"], "INVALID_REQUEST");
        }
        let mut extra = request();
        extra["command"] = json!("whoami");
        assert_eq!(handle_frame(extra.to_string().as_bytes())["ok"], false);
    }

    #[test]
    fn handles_multiple_frames_and_exits_on_eof() {
        let line = format!("{}\r\n", request());
        let mut output = Vec::new();
        serve(Cursor::new(line.repeat(2)), &mut output).unwrap();
        assert_eq!(String::from_utf8(output).unwrap().lines().count(), 2);
    }

    #[test]
    fn bounds_memory_and_stops_after_oversized_frame() {
        let mut output = Vec::new();
        serve(Cursor::new(vec![b'x'; MAX_FRAME_BYTES * 2]), &mut output).unwrap();
        let value: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(value["error"]["code"], "FRAME_TOO_LARGE");
    }

    #[test]
    fn shared_contract_fixture_is_supported() {
        let fixture = include_bytes!("../../../tests/fixtures/version-request.json");
        assert_eq!(handle_frame(fixture)["ok"], true);
    }
}
