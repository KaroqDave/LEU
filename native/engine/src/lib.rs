use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, BufRead, Read, Write};

pub const PROTOCOL_VERSION: u64 = 1;
/// Largest request line, including its newline. Requests carry identifiers, never bulk data.
pub const MAX_REQUEST_BYTES: usize = 16 * 1024;
/// Largest response line, including its newline. Inventory results need far more than a request.
pub const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

/// Every method the engine accepts. Dispatch rejects anything else before parsing params.
const METHODS: &[&str] = &["engine.version"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    #[serde(rename = "protocolVersion")]
    protocol_version: u64,
    id: String,
    method: String,
    params: Value,
}

#[derive(Deserialize)]
#[serde(tag = "method", content = "params", deny_unknown_fields)]
enum Method {
    #[serde(rename = "engine.version")]
    EngineVersion(EmptyParams),
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

fn success(id: Value, result: Value) -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "id": id,
        "ok": true,
        "result": result
    })
}

pub fn handle_frame(bytes: &[u8]) -> Value {
    let envelope = match serde_json::from_slice::<Envelope>(bytes) {
        Ok(envelope)
            if !envelope.id.is_empty()
                && envelope.id.chars().count() <= 64
                && !envelope.method.is_empty()
                && envelope.method.chars().count() <= 64
                && envelope.params.is_object() =>
        {
            envelope
        }
        _ => return failure(Value::Null, "INVALID_REQUEST", "Invalid request envelope."),
    };

    let id = Value::String(envelope.id);
    if envelope.protocol_version != PROTOCOL_VERSION {
        return failure(id, "PROTOCOL_MISMATCH", "Unsupported protocol version.");
    }
    if !METHODS.contains(&envelope.method.as_str()) {
        return failure(id, "UNKNOWN_METHOD", "Unsupported engine method.");
    }
    let method = match serde_json::from_value::<Method>(
        json!({ "method": envelope.method, "params": envelope.params }),
    ) {
        Ok(method) => method,
        Err(_) => return failure(id, "INVALID_REQUEST", "Invalid method parameters."),
    };

    match method {
        Method::EngineVersion(EmptyParams {}) => success(
            id,
            json!({
                "engineVersion": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH
            }),
        ),
    }
}

/// Writes one response line, replacing it with a failure when it would exceed `limit`.
fn write_response(output: &mut impl Write, response: &Value, limit: usize) -> io::Result<()> {
    let mut line = serde_json::to_vec(response)?;
    if line.len() + 1 > limit {
        line = serde_json::to_vec(&failure(
            response["id"].clone(),
            "RESPONSE_TOO_LARGE",
            "Response exceeds the protocol limit.",
        ))?;
    }
    line.push(b'\n');
    output.write_all(&line)?;
    output.flush()
}

pub fn serve(mut input: impl BufRead, mut output: impl Write) -> io::Result<()> {
    loop {
        let mut frame = Vec::new();
        let read = input
            .by_ref()
            .take((MAX_REQUEST_BYTES + 1) as u64)
            .read_until(b'\n', &mut frame)?;
        if read == 0 {
            return Ok(());
        }
        let oversized = frame.len() > MAX_REQUEST_BYTES;
        let response = if oversized {
            failure(
                Value::Null,
                "FRAME_TOO_LARGE",
                "Request exceeds 16384 bytes.",
            )
        } else {
            handle_frame(&frame)
        };
        write_response(&mut output, &response, MAX_RESPONSE_BYTES)?;
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
        for params in [json!({ "command": "whoami" }), json!(null), json!([])] {
            let mut input = request();
            input["params"] = params;
            let response = handle_frame(input.to_string().as_bytes());
            assert_eq!(response["error"]["code"], "INVALID_REQUEST");
        }
        for bytes in [b"not json".to_vec(), vec![255]] {
            assert_eq!(handle_frame(&bytes)["error"]["code"], "INVALID_REQUEST");
        }
        let mut extra = request();
        extra["command"] = json!("whoami");
        assert_eq!(handle_frame(extra.to_string().as_bytes())["ok"], false);
    }

    #[test]
    fn invalid_params_keep_the_request_id() {
        let mut input = request();
        input["params"] = json!({ "command": "whoami" });
        assert_eq!(handle_frame(input.to_string().as_bytes())["id"], "test");
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
        serve(Cursor::new(vec![b'x'; MAX_REQUEST_BYTES * 2]), &mut output).unwrap();
        let value: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(value["error"]["code"], "FRAME_TOO_LARGE");
    }

    #[test]
    fn replaces_oversized_responses_with_a_failure() {
        let response = success(json!("big"), json!({ "data": "x".repeat(400) }));
        let mut output = Vec::new();
        write_response(&mut output, &response, 256).unwrap();
        assert!(output.len() <= 256 && output.ends_with(b"\n"));
        let value: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(value["id"], "big");
        assert_eq!(value["error"]["code"], "RESPONSE_TOO_LARGE");
    }

    #[test]
    fn response_limit_counts_the_newline() {
        let response = success(json!("edge"), json!({}));
        let size = serde_json::to_vec(&response).unwrap().len();
        let mut output = Vec::new();
        write_response(&mut output, &response, size + 1).unwrap();
        assert_eq!(output.len(), size + 1);
        output.clear();
        write_response(&mut output, &response, size).unwrap();
        let value: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(value["error"]["code"], "RESPONSE_TOO_LARGE");
    }

    #[test]
    fn every_listed_method_has_a_variant() {
        // An allowlisted name without a matching variant would surface as a parameter error.
        for method in METHODS {
            let input = json!({ "method": method, "params": {} });
            let error = serde_json::from_value::<Method>(input).err();
            assert!(
                error.is_none_or(|error| !error.to_string().contains("unknown variant")),
                "{method}"
            );
        }
    }

    #[test]
    fn shared_contract_fixture_is_supported() {
        let fixture = include_bytes!("../../../tests/fixtures/version-request.json");
        assert_eq!(handle_frame(fixture)["ok"], true);
    }
}
