# The derived key must be created by an administrator, never by the app.
path "transit/encrypt/assertide" {
  capabilities = ["update"]
}
path "transit/decrypt/assertide" {
  capabilities = ["update"]
}
