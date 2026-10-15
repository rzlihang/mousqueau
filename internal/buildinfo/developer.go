//go:build !production

package buildinfo

// Developer is true for wails3 dev and any other build that does not pass
// -tags production. Packaged builds compile developer_production.go instead.
const Developer = true
