import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const forbidden = new Set([
  'ErrorResponse', 'BirthDataInput', 'UserResponse', 'UserUpdateRequest',
  'OAuthTokenResponse', 'TokenRefreshRequest', 'TokenRefreshResponse',
  'BirthChartGenerationRequest', 'AstrologicalQuestionRequest', 'DashaInfo',
  'AstrologicalQuestionResponse', 'RecentCall', 'CallTypeBreakdown',
  'MonthlyUsage', 'UsageResponse', 'WorkflowStatus', 'WorkflowProgress',
  'WorkflowStartResponse', 'WorkflowStatusResponse', 'WorkflowResultResponse',
  'StartOnboardingRequest', 'LifeEventType', 'LIFE_EVENT_TYPE_LABELS',
  'StoredLifeEvent', 'LifeEventCreateInput', 'LifeEventUpdateInput',
  'LifeEventsResponse', 'LifeEventDeleteResponse', 'UserTier',
  'TokenBudgetStatus', 'TokenBudgetError', 'SepInterpretationVersionsResponse',
]);

const retiredSeparatedChartContracts = new Set([
  'SepAyanamsaType',
  'SepHouseSystem',
  'SepViewMode',
  'SepInterpretationSection',
  'SepFocusArea',
  'SepChartCalculationRequest',
  'SepChartCalculationResponse',
  'SepInterpretationRequest',
  'SepInterpretationResponse',
  'SepStreamingInterpretationRequest',
  'SepReinterpretationRequest',
  'SepInterpretationVersionSummary',
  'SepInterpretationVersion',
  'SepInterpretationStreamEvent',
  'SepInterpretationStreamStart',
  'SepInterpretationSectionStart',
  'SepInterpretationToken',
  'SepInterpretationSectionComplete',
  'SepInterpretationStreamComplete',
  'SepInterpretationStreamUsage',
  'SepInterpretationStreamError',
  'SepChartCalculationError',
  'SepInterpretationError',
]);

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function collectBindingNames(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, names);
  }
}

function collectDeclarationNames(statement: ts.Statement, names: Set<string>): void {
  if (!isExported(statement)) return;
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, names);
    }
    return;
  }
  if (
    (ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isClassDeclaration(statement)
      || ts.isFunctionDeclaration(statement))
    && statement.name
  ) {
    names.add(statement.name.text);
  }
}

function localModulePath(moduleName: string, containingFile: string): string | null {
  if (!moduleName.startsWith('.')) return null;
  const directory = containingFile.slice(0, containingFile.lastIndexOf('/'));
  const suffix = moduleName.endsWith('.ts') ? moduleName : `${moduleName}.ts`;
  const path = ts.sys.resolvePath(`${directory}/${suffix}`);
  return ts.sys.fileExists(path) ? path : null;
}

function readSource(sourcePath: string): string {
  const source = ts.sys.readFile(sourcePath);
  if (source === undefined) throw new Error(`Unable to read TypeScript source: ${sourcePath}`);
  return source;
}

function collectExportDeclaration(
  declaration: ts.ExportDeclaration,
  containingFile: string,
  names: Set<string>,
  visited: Set<string>,
): void {
  if (declaration.exportClause && ts.isNamedExports(declaration.exportClause)) {
    for (const element of declaration.exportClause.elements) names.add(element.name.text);
    return;
  }
  if (!declaration.exportClause && declaration.moduleSpecifier && ts.isStringLiteral(declaration.moduleSpecifier)) {
    const modulePath = localModulePath(declaration.moduleSpecifier.text, containingFile);
    if (modulePath) collectExportedNamesFromPath(modulePath, names, visited);
  }
}

function collectExportedNamesFromPath(
  sourcePath: string,
  names: Set<string>,
  visited: Set<string>,
): void {
  if (visited.has(sourcePath)) return;
  visited.add(sourcePath);
  const source = ts.createSourceFile(
    sourcePath,
    readSource(sourcePath),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    collectDeclarationNames(statement, names);
    if (ts.isExportDeclaration(statement)) {
      collectExportDeclaration(statement, sourcePath, names, visited);
    }
  }
}

function collectExportedNames(source: ts.SourceFile, sourcePath: string): Set<string> {
  const names = new Set<string>();
  const visited = new Set<string>([sourcePath]);
  for (const statement of source.statements) {
    collectDeclarationNames(statement, names);
    if (ts.isExportDeclaration(statement)) {
      collectExportDeclaration(statement, sourcePath, names, visited);
    }
  }
  return names;
}

function sharedTypeExports(): Set<string> {
  const indexPath = ts.sys.resolvePath(decodeURIComponent(new URL('index.ts', import.meta.url).pathname));
  const source = ts.createSourceFile(
    indexPath,
    readSource(indexPath),
    ts.ScriptTarget.Latest,
    true,
  );
  return collectExportedNames(source, indexPath);
}

describe('shared-types public surface', () => {
  it('does not export removed server-era contracts', () => {
    const names = sharedTypeExports();
    expect([...names].filter((name) => forbidden.has(name))).toEqual([]);
  });

  it('does not export retired separated-chart contracts', () => {
    const names = sharedTypeExports();
    expect([...names].filter((name) => retiredSeparatedChartContracts.has(name))).toEqual([]);
  });
});
