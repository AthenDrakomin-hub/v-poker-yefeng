#!/usr/bin/env node
/**
 * UTS / uvue 语法检查（无 HBuilderX GUI 时的兜底验证）
 *
 * 原理：UTS 语法与 TypeScript 高度一致，用 TS 的 parser 只做「语法」解析，
 *      报告 parseDiagnostics（语法错误），不做类型检查（类型由 HBuilderX 的 UTS 编译器负责）。
 *
 * 用法：
 *   node tools/uts-syntax-check.mjs
 *   node tools/uts-syntax-check.mjs --ts "C:/path/to/typescript"
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
function arg(name, def) {
	const i = args.indexOf(name)
	return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const PROJECT = path.resolve(arg('--project', process.cwd()))
const TS_PATH = arg('--ts', 'C:/Users/88903/HBuilderX/HBuilderX/plugins/hbuilderx-language-services/node_modules/typescript')

const require = createRequire(import.meta.url)
let ts = null
const candidates = [TS_PATH, path.join(TS_PATH, 'lib', 'typescript.js'), path.join(TS_PATH, 'lib', 'tsserverlibrary.js')]
for (const c of candidates) {
	try {
		ts = require(c)
		break
	} catch (e) {
		/* try next */
	}
}
if (ts == null) {
	console.error(`无法加载 TypeScript: ${TS_PATH}`)
	process.exit(2)
}

const SKIP_DIRS = new Set(['node_modules', 'unpackage', '.git', '.hbuilderx', 'uni_modules'])

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) {
			if (SKIP_DIRS.has(e.name)) continue
			walk(path.join(dir, e.name), out)
		} else if (e.name.endsWith('.uts') || e.name.endsWith('.uvue')) {
			out.push(path.join(dir, e.name))
		}
	}
	return out
}

/** 提取 <script ...> ... </script> 内容 */
function extractScript(src) {
	const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
	return m ? m[1] : null
}

const files = walk(PROJECT)
let checked = 0
let failed = 0

for (const file of files) {
	const rel = path.relative(PROJECT, file).replace(/\\/g, '/')
	const raw = fs.readFileSync(file, 'utf8')
	const isUvue = file.endsWith('.uvue')
	const code = isUvue ? extractScript(raw) : raw
	if (code == null) {
		console.log(`[SKIP] ${rel}  (未找到 <script> 块)`)
		continue
	}

	const sf = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS)
	const diags = sf.parseDiagnostics || []
	checked++
	if (diags.length === 0) {
		continue
	}

	failed++
	console.log(`\n[FAIL] ${rel}`)
	for (const d of diags.slice(0, 10)) {
		const pos = sf.getLineAndCharacterOfPosition(d.start)
		const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ')
		console.log(`   L${pos.line + 1}:${pos.character + 1}  ${msg}`)
	}
	if (diags.length > 10) {
		console.log(`   … 另有 ${diags.length - 10} 条`)
	}
}

console.log(`\n=== 语法检查：扫描 ${files.length} 个文件，检查 ${checked} 个，失败 ${failed} 个 ===`)
console.log(`（仅语法级；UTS 类型检查需 HBuilderX 的 UTS 编译器）`)
process.exit(failed === 0 ? 0 : 1)
