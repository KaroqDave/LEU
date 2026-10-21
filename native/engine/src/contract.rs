//! The protocol contract exported to the TypeScript side. `pnpm contracts` writes it to
//! `src/contracts/contract.json` and generates `src/contracts/generated.ts` from it; `pnpm check`
//! fails when either file differs from what this module produces.

use super::{
    Envelope, ErrorCode, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, PROTOCOL_VERSION, Response,
    method_schemas,
};
use schemars::generate::SchemaSettings;
use serde_json::{Map, Value, json};

pub fn contract() -> Value {
    let settings = SchemaSettings::draft07().with(|settings| settings.inline_subschemas = true);
    let mut requests = settings.clone().into_generator();
    let mut responses = settings.for_serialize().into_generator();
    let methods = method_schemas(&mut requests, &mut responses);
    let error_code = responses.subschema_for::<ErrorCode>();
    let mut contract = json!({
        "protocolVersion": PROTOCOL_VERSION,
        "limits": { "requestBytes": MAX_REQUEST_BYTES, "responseBytes": MAX_RESPONSE_BYTES },
        "errorCode": error_code,
        "request": requests.subschema_for::<Envelope>(),
        "response": responses.subschema_for::<Response<Map<String, Value>>>(),
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
