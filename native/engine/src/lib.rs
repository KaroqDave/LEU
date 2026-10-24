use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::io::{self, BufRead, Read, Write};

mod inventory;

#[cfg(feature = "schema")]
mod contract;
#[cfg(feature = "schema")]
pub use contract::contract;

pub const PROTOCOL_VERSION: u64 = 1;
/// Largest request line, including its newline. Requests carry identifiers, never bulk data.
pub const MAX_REQUEST_BYTES: usize = 16 * 1024;
/// Largest response line, including its newline. Inventory results need far more than a request.
pub const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_ID_CHARS: usize = 64;
const MAX_METHOD_CHARS: usize = 64;
const MAX_ERROR_MESSAGE_CHARS: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(title = "EngineRemoteErrorCode"))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidRequest,
    ProtocolMismatch,
    UnknownMethod,
    FrameTooLarge,
    ResponseTooLarge,
}

/// Declares each engine method once: wire name, dispatch variant, parameters, and result. It
/// generates dispatch, the method allowlist, and the exported schemas. Each handler's result
/// must have the declared type, so the runtime response and its schema cannot drift apart.
macro_rules! engine_methods {
    ($($name:literal => $variant:ident($params:ty) -> $result:ty = $handler:path;)+) => {
        #[derive(Deserialize)]
        #[serde(tag = "method", content = "params", deny_unknown_fields)]
        enum Method {
            $(#[serde(rename = $name)] $variant($params),)+
        }

        /// Dispatch rejects anything else before parsing params.
        const METHODS: &[&str] = &[$($name),+];

        impl Method {
            fn dispatch(self, id: String) -> Value {
                match self {
                    $(Self::$variant(params) => {
                        let result: $result = $handler(params);
                        success(id, result)
                    },)+
                }
            }
        }

        #[cfg(feature = "schema")]
        fn method_schemas(
            requests: &mut schemars::SchemaGenerator,
            responses: &mut schemars::SchemaGenerator,
        ) -> serde_json::Map<String, Value> {
            let mut methods = serde_json::Map::new();
            $(methods.insert($name.to_owned(), json!({
                "typeName": stringify!($variant),
                "params": requests.subschema_for::<$params>(),
                "result": responses.subschema_for::<$result>(),
            }));)+
            methods
        }
    };
}

engine_methods! {
    "engine.version" => EngineVersion(EmptyParams) -> EngineVersionResult = engine_version;
    "inventory.list" => InventoryList(EmptyParams) -> inventory::InventoryResult = inventory::list;
    "inventory.icon" => InventoryIcon(inventory::icon::IconParams) -> inventory::icon::IconResult = inventory::icon::icon;
}

#[derive(Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(title = "EngineRequest"))]
#[serde(deny_unknown_fields)]
struct Envelope {
    #[serde(rename = "protocolVersion")]
    #[cfg_attr(feature = "schema", schemars(range(min = 1)))]
    protocol_version: u64,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = MAX_ID_CHARS)))]
    id: String,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = MAX_METHOD_CHARS)))]
    method: String,
    params: Map<String, Value>,
}

// A boolean discriminator whose serialized value is fixed by its type.
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(with = "bool", extend("const" = OK)))]
struct ResponseOk<const OK: bool>;

impl<const OK: bool> Serialize for ResponseOk<OK> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bool(OK)
    }
}

#[derive(Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(title = "EngineResponse"))]
#[serde(untagged)]
enum Response<R> {
    Success(SuccessResponse<R>),
    Failure(FailureResponse),
}

#[derive(Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(title = "EngineSuccessResponse"))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SuccessResponse<R> {
    #[cfg_attr(feature = "schema", schemars(range(min = 1)))]
    protocol_version: u64,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = MAX_ID_CHARS)))]
    id: String,
    ok: ResponseOk<true>,
    result: R,
}

#[derive(Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "schema", schemars(title = "EngineFailureResponse"))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FailureResponse {
    #[cfg_attr(feature = "schema", schemars(range(min = 1)))]
    protocol_version: u64,
    #[cfg_attr(feature = "schema", schemars(length(max = MAX_ID_CHARS)))]
    id: Option<String>,
    ok: ResponseOk<false>,
    error: RemoteError,
}

#[derive(Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct RemoteError {
    code: ErrorCode,
    #[cfg_attr(feature = "schema", schemars(length(max = MAX_ERROR_MESSAGE_CHARS)))]
    message: String,
}

#[derive(Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
struct EmptyParams {}

#[derive(Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EngineVersionResult {
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = 64)))]
    engine_version: String,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = 32)))]
    platform: String,
    #[cfg_attr(feature = "schema", schemars(length(min = 1, max = 32)))]
    arch: String,
}

fn engine_version(_: EmptyParams) -> EngineVersionResult {
    EngineVersionResult {
        engine_version: env!("CARGO_PKG_VERSION").to_owned(),
        platform: std::env::consts::OS.to_owned(),
        arch: std::env::consts::ARCH.to_owned(),
    }
}

fn failure(id: Option<String>, code: ErrorCode, message: &str) -> Value {
    debug_assert!(message.chars().count() <= MAX_ERROR_MESSAGE_CHARS);
    serde_json::to_value(Response::<Map<String, Value>>::Failure(FailureResponse {
        protocol_version: PROTOCOL_VERSION,
        id,
        ok: ResponseOk,
        error: RemoteError {
            code,
            message: message.to_owned(),
        },
    }))
    .expect("failure response is serializable")
}

fn success(id: String, result: impl Serialize) -> Value {
    serde_json::to_value(Response::Success(SuccessResponse {
        protocol_version: PROTOCOL_VERSION,
        id,
        ok: ResponseOk,
        result,
    }))
    .expect("method result is serializable")
}

pub fn handle_frame(bytes: &[u8]) -> Value {
    // Inspect the version without assuming a future protocol's envelope shape.
    let value: Value = match serde_json::from_slice(bytes) {
        Ok(value) => value,
        Err(_) => return failure(None, ErrorCode::InvalidRequest, "Invalid request envelope."),
    };
    if let Some(version) = value.get("protocolVersion").and_then(Value::as_u64)
        && version != PROTOCOL_VERSION
    {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.chars().count() <= MAX_ID_CHARS)
            .map(str::to_owned);
        return failure(
            id,
            ErrorCode::ProtocolMismatch,
            "Unsupported protocol version.",
        );
    }

    let envelope = match serde_json::from_slice::<Envelope>(bytes) {
        Ok(envelope)
            if !envelope.id.is_empty()
                && envelope.id.chars().count() <= MAX_ID_CHARS
                && !envelope.method.is_empty()
                && envelope.method.chars().count() <= MAX_METHOD_CHARS =>
        {
            envelope
        }
        _ => {
            return failure(None, ErrorCode::InvalidRequest, "Invalid request envelope.");
        }
    };

    debug_assert_eq!(envelope.protocol_version, PROTOCOL_VERSION);
    let id = envelope.id;
    if !METHODS.contains(&envelope.method.as_str()) {
        return failure(
            Some(id),
            ErrorCode::UnknownMethod,
            "Unsupported engine method.",
        );
    }
    let method = match serde_json::from_value::<Method>(
        json!({ "method": envelope.method, "params": envelope.params }),
    ) {
        Ok(method) => method,
        Err(_) => {
            return failure(
                Some(id),
                ErrorCode::InvalidRequest,
                "Invalid method parameters.",
            );
        }
    };

    method.dispatch(id)
}

/// Writes one response line, replacing it with a failure when it would exceed `limit`.
fn write_response(output: &mut impl Write, response: &Value, limit: usize) -> io::Result<()> {
    let mut line = serde_json::to_vec(response)?;
    if line.len() + 1 > limit {
        line = serde_json::to_vec(&failure(
            response["id"].as_str().map(str::to_owned),
            ErrorCode::ResponseTooLarge,
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
                None,
                ErrorCode::FrameTooLarge,
                &format!("Request exceeds {MAX_REQUEST_BYTES} bytes."),
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
    fn checks_version_before_assuming_the_envelope_shape() {
        for input in [
            json!({ "protocolVersion": 2, "id": "future", "extra": true }),
            json!({ "protocolVersion": 2, "params": [], "futurePayload": {} }),
            json!({ "protocolVersion": 2, "id": "x".repeat(MAX_ID_CHARS + 1) }),
        ] {
            let response = handle_frame(input.to_string().as_bytes());
            assert_eq!(response["error"]["code"], "PROTOCOL_MISMATCH");
            assert_eq!(
                response["id"],
                if input["id"] == "future" {
                    json!("future")
                } else {
                    Value::Null
                }
            );
        }
        for version in [json!("2"), json!(-1), json!(1.5), Value::Null] {
            let mut input = request();
            input["protocolVersion"] = version;
            assert_eq!(
                handle_frame(input.to_string().as_bytes())["error"]["code"],
                "INVALID_REQUEST"
            );
        }
    }

    #[test]
    fn bounds_request_identifiers_and_method_names() {
        for (field, limit) in [("id", MAX_ID_CHARS), ("method", MAX_METHOD_CHARS)] {
            for value in [String::new(), "ü".repeat(limit + 1)] {
                let mut input = request();
                input[field] = json!(value);
                assert_eq!(
                    handle_frame(input.to_string().as_bytes())["error"]["code"],
                    "INVALID_REQUEST"
                );
            }
        }
        let mut input = request();
        input["id"] = json!("ü".repeat(MAX_ID_CHARS));
        assert_eq!(handle_frame(input.to_string().as_bytes())["ok"], true);
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
        let response = success("big".to_owned(), json!({ "data": "x".repeat(400) }));
        let mut output = Vec::new();
        write_response(&mut output, &response, 256).unwrap();
        assert!(output.len() <= 256 && output.ends_with(b"\n"));
        let value: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(value["id"], "big");
        assert_eq!(value["error"]["code"], "RESPONSE_TOO_LARGE");
    }

    #[test]
    fn response_limit_counts_the_newline() {
        let response = success("edge".to_owned(), json!({}));
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
    fn shared_contract_fixture_is_supported() {
        let fixture = include_bytes!("../../../tests/fixtures/version-request.json");
        assert_eq!(handle_frame(fixture)["ok"], true);
    }
}
