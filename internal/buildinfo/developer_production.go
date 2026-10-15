//go:build production

package buildinfo

// Developer is false in packaged builds, which pass -tags production.
const Developer = false
