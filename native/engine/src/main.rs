use std::io;

fn main() {
    if let Err(error) = leu_engine::serve(io::stdin().lock(), io::stdout().lock()) {
        eprintln!("Engine transport failed: {error}");
        std::process::exit(1);
    }
}
