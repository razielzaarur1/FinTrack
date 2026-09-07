path "transit/decrypt/bank-credentials" {
  capabilities = ["update"]
}

path "*" {
  capabilities = ["deny"]
}
