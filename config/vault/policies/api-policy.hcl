path "transit/encrypt/bank-credentials" {
  capabilities = ["update"]
}

path "*" {
  capabilities = ["deny"]
}
