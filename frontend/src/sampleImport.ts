// Sample import is a developer entry. Go sets SettingsView.developer from the
// production build tag: true for wails3 dev and other non-production builds,
// false when the binary is built with -tags production. Undefined (settings
// not loaded yet) stays hidden so a production window never flashes the control.
export function showSampleImport(developer: boolean | undefined): boolean {
  return developer === true;
}
