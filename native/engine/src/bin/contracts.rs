//! Prints the protocol contract as JSON. Run through `pnpm contracts`, not directly.

fn main() {
    println!("{}", leu_engine::contract());
}
