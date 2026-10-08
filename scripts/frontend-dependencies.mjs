export function productionDependencyPaths(projects) {
  const paths = new Set();
  function visit(dependency) {
    paths.add(dependency.path);
    visitChildren(dependency);
  }
  function visitChildren(dependency) {
    for (const child of Object.values(dependency.dependencies ?? {})) visit(child);
    for (const child of Object.values(dependency.optionalDependencies ?? {})) visit(child);
  }
  for (const project of projects) visitChildren(project);
  return [...paths].sort();
}
