//! The protocol contract exported to the TypeScript side. `pnpm contracts` writes it to
//! `src/contracts/contract.json` and generates `src/contracts/generated.ts` from it; `pnpm check`
//! fails when either file differs from what this module produces.

use super::{
    ErrorCode, MAX_ERROR_MESSAGE_CHARS, MAX_ID_CHARS, MAX_METHOD_CHARS, MAX_REQUEST_BYTES,
    MAX_RESPONSE_BYTES, PROTOCOL_VERSION, method_schemas,
};
use schemars::generate::SchemaSettings;
use serde_json::{Value, json};

pub fn contract() -> Value {
    let mut generator = SchemaSettings::draft07()
        .with(|settings| settings.inline_subschemas = true)
        .into_generator();
    let methods = method_schemas(&mut generator);
    let error_code = generator.subschema_for::<ErrorCode>();
    let id = json!({ "type": "string", "minLength": 1, "maxLength": MAX_ID_CHARS });
    let version = json!({ "type": "integer", "minimum": 1 });
    let mut contract = json!({
        "protocolVersion": PROTOCOL_VERSION,
        "limits": { "requestBytes": MAX_REQUEST_BYTES, "responseBytes": MAX_RESPONSE_BYTES },
        "errorCode": error_code,
        "request": {
            "title": "EngineRequest",
            "type": "object",
            "additionalProperties": false,
            "required": ["protocolVersion", "id", "method", "params"],
            "properties": {
                "protocolVersion": version,
                "id": id,
                "method": { "type": "string", "minLength": 1, "maxLength": MAX_METHOD_CHARS },
                "params": { "type": "object" }
            }
        },
        "response": {
            "title": "EngineResponse",
            "oneOf": [
                {
                    "title": "EngineSuccessResponse",
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["protocolVersion", "id", "ok", "result"],
                    "properties": {
                        "protocolVersion": version,
                        "id": id,
                        "ok": { "const": true },
                        "result": { "type": "object" }
                    }
                },
                {
                    "title": "EngineFailureResponse",
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["protocolVersion", "id", "ok", "error"],
                    "properties": {
                        "protocolVersion": version,
                        "id": { "type": ["string", "null"], "maxLength": MAX_ID_CHARS },
                        "ok": { "const": false },
                        "error": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["code", "message"],
                            "properties": {
                                "code": error_code,
                                "message": { "type": "string", "maxLength": MAX_ERROR_MESSAGE_CHARS }
                            }
                        }
                    }
                }
            ]
        },
        "methods": methods,
    });
    strip_integer_formats(&mut contract);
    contract
}

/// schemars annotates integers with formats such as `uint64`, which strict Ajv rejects as
/// unknown. Ranges are already expressed through `minimum` and `maximum`.
fn strip_integer_formats(value: &mut Value) {
    match value {
        Value::Object(object) => {
            let integer = match object.get("type") {
                Some(Value::String(kind)) => kind == "integer",
                Some(Value::Array(kinds)) => kinds.iter().any(|kind| kind == "integer"),
                _ => false,
            };
            if integer {
                object.remove("format");
            }
            object.values_mut().for_each(strip_integer_formats);
        }
        Value::Array(items) => items.iter_mut().for_each(strip_integer_formats),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_every_method_and_error_code() {
        let contract = contract();
        assert_eq!(contract["protocolVersion"], PROTOCOL_VERSION);
        assert!(contract["methods"]["engine.version"]["result"]["properties"]["arch"].is_object());
        let codes = contract["errorCode"]["enum"].as_array().unwrap();
        assert!(codes.contains(&json!("RESPONSE_TOO_LARGE")));
    }

    #[test]
    fn removes_integer_formats_only() {
        let mut schema = json!({
            "properties": {
                "size": { "type": ["integer", "null"], "format": "uint64", "minimum": 0 },
                "name": { "type": "string", "format": "uri" }
            }
        });
        strip_integer_formats(&mut schema);
        assert!(schema["properties"]["size"].get("format").is_none());
        assert_eq!(schema["properties"]["name"]["format"], "uri");
    }
}
