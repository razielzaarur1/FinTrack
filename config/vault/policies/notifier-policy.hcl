path "sys/unseal" {
  capabilities = ["update"]
}

path "*" {
  capabilities = ["deny"]
}
