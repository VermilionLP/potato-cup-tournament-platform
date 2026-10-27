// Compiles the given .svelte / .svelte.js files and prints compile errors.
// Run through scripts/svelte-check-offline.sh, which provides the compiler.

import fs from 'node:fs';

// The Svelte source expects this build-time global.
globalThis.DEBUG = false;
const { compile, compileModule } = await import('svelte/compiler');

const { parse } = await import('acorn');

// Browser globals the compiled code may use besides the JS built-ins.
const BROWSER = new Set(`window document navigator location history localStorage sessionStorage
  fetch EventSource Notification CustomEvent Event KeyboardEvent MouseEvent HTMLElement Element Node
  requestAnimationFrame cancelAnimationFrame getComputedStyle matchMedia alert confirm prompt
  performance screen Image Audio Blob File FileReader FormData Headers Request Response
  ResizeObserver IntersectionObserver MutationObserver DOMParser XMLSerializer self
  crypto indexedDB caches ServiceWorkerRegistration PushManager scrollTo open print
  NodeFilter Text Range Selection getSelection TreeWalker DOMRect`.split(/\s+/));

// Identifiers the compiled module reads but never declares (a missing
// variable or function after moving code around), minus known globals.
function freeVariables(code) {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const free = new Set();
  const scopes = [];
  const declared = (name) => scopes.some((s) => s.has(name));
  const addPattern = (scope, node) => {
    if (!node) return;
    if (node.type === 'Identifier') scope.add(node.name);
    else if (node.type === 'ObjectPattern') node.properties.forEach((p) => addPattern(scope, p.type === 'RestElement' ? p.argument : p.value));
    else if (node.type === 'ArrayPattern') node.elements.forEach((e) => addPattern(scope, e));
    else if (node.type === 'RestElement') addPattern(scope, node.argument);
    else if (node.type === 'AssignmentPattern') addPattern(scope, node.left);
  };
  // Declarations made directly in a block/body (hoisted for the whole block).
  const hoist = (scope, body, fnScope) => {
    for (const st of body) {
      const node = st.type?.startsWith('Export') && st.declaration ? st.declaration : st;
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') node.id && scope.add(node.id.name);
      else if (node.type === 'VariableDeclaration') node.declarations.forEach((d) => addPattern(node.kind === 'var' ? fnScope : scope, d.id));
      else if (node.type === 'ImportDeclaration') node.specifiers.forEach((sp) => scope.add(sp.local.name));
    }
  };
  const walk = (node, parent, fnScope) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Program': case 'BlockStatement': case 'StaticBlock': {
        const scope = new Set(); scopes.push(scope);
        hoist(scope, node.body, node.type === 'Program' ? scope : fnScope);
        node.body.forEach((n) => walk(n, node, node.type === 'Program' ? scope : fnScope));
        scopes.pop(); return;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const scope = new Set(); scopes.push(scope);
        if (node.type === 'FunctionExpression' && node.id) scope.add(node.id.name);
        node.params.forEach((p) => addPattern(scope, p));
        node.params.forEach((p) => walkPattern(p, scope));
        if (node.body.type === 'BlockStatement') { hoist(scope, node.body.body, scope); node.body.body.forEach((n) => walk(n, node.body, scope)); }
        else walk(node.body, node, scope);
        scopes.pop(); return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        const scope = new Set(); if (node.id) scope.add(node.id.name); scopes.push(scope);
        walk(node.superClass, node, fnScope); node.body.body.forEach((m) => { if (m.computed) walk(m.key, m, fnScope); walk(m.value, m, fnScope); });
        scopes.pop(); return;
      }
      case 'CatchClause': { const scope = new Set(); addPattern(scope, node.param); scopes.push(scope); walk(node.body, node, fnScope); scopes.pop(); return; }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const scope = new Set(); scopes.push(scope);
        const init = node.init || node.left;
        if (init?.type === 'VariableDeclaration') init.declarations.forEach((d) => addPattern(init.kind === 'var' ? fnScope : scope, d.id));
        for (const k of ['init', 'left', 'test', 'update', 'right', 'body']) walk(node[k], node, fnScope);
        scopes.pop(); return;
      }
      case 'VariableDeclarator': walkPattern(node.id, null); walk(node.init, node, fnScope); return;
      case 'Identifier':
        if (!declared(node.name) && !(node.name in globalThis) && !BROWSER.has(node.name)) free.add(node.name);
        return;
      case 'MemberExpression': walk(node.object, node, fnScope); if (node.computed) walk(node.property, node, fnScope); return;
      case 'Property': case 'PropertyDefinition': case 'MethodDefinition':
        if (node.computed) walk(node.key, node, fnScope);
        if (node.type === 'Property' && node.shorthand) walk(node.value, node, fnScope); else walk(node.value, node, fnScope);
        return;
      case 'LabeledStatement': walk(node.body, node, fnScope); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'ImportDeclaration': return;
      case 'ExportNamedDeclaration': if (node.declaration) walk(node.declaration, node, fnScope); return;
      case 'ExportDefaultDeclaration': walk(node.declaration, node, fnScope); return;
      case 'MetaProperty': return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => walk(c, node, fnScope));
      else if (v && typeof v.type === 'string') walk(v, node, fnScope);
    }
    function walkPattern() {}
  };
  // Default values inside patterns are expressions.
  function walkPattern(p, fnScope) {
    if (!p) return;
    if (p.type === 'AssignmentPattern') { walk(p.right, p, fnScope); walkPattern(p.left, fnScope); }
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => { if (q.type === 'RestElement') walkPattern(q.argument, fnScope); else { if (q.computed) walk(q.key, q, fnScope); walkPattern(q.value, fnScope); } });
    else if (p.type === 'ArrayPattern') p.elements.forEach((e) => walkPattern(e, fnScope));
  }
  walk(ast, null, null);
  return [...free].sort();
}

let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    const source = fs.readFileSync(file, 'utf8');
    const out = file.endsWith('.svelte')
      ? compile(source, { filename: file, generate: 'client', runes: true })
      : compileModule(source, { filename: file, generate: 'client' });
    const free = freeVariables(out.js.code);
    if (free.length) {
      failed += 1;
      console.log(`ERROR ${file}\n  undefined: ${free.join(', ')}`);
    }
  } catch (err) {
    failed += 1;
    const where = err.start ? `:${err.start.line}:${err.start.column}` : '';
    console.log(`ERROR ${file}${where}\n  ${String(err.message).split('\n')[0]}`);
  }
}
console.log(failed ? `${failed} file(s) failed to compile` : 'all files compile');
process.exit(failed ? 1 : 0);
