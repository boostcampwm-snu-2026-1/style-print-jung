#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const repoRoot = process.cwd()
const wikiDir = path.join(repoRoot, 'docs', 'wiki')

if (!existsSync(wikiDir)) {
  fail('Run this script from the StylePrint repo root; docs/wiki was not found.')
}

const week = Number(args.week || detectNextWeek(wikiDir))
if (!Number.isInteger(week) || week < 1) {
  fail('Pass a positive integer week number with --week N.')
}

const kind = args.kind || 'task-issues'
if (!['task-issues', 'technical-requirements'].includes(kind)) {
  fail('Use --kind task-issues or --kind technical-requirements.')
}

const filePath = path.join(wikiDir, `week${week}-${kind}.md`)
if (existsSync(filePath) && !args.force) {
  fail(`${path.relative(repoRoot, filePath)} already exists. Pass --force to overwrite.`)
}

const focus = args.focus || '[이번 주 목표를 한 문장으로 정리한다]'
const title =
  kind === 'technical-requirements'
    ? `StylePrint ${week}주차 기술 요구사항 실행 계획`
    : `${week}주차 Task 계획`

const body = buildTemplate({ title, week, kind, focus })
if (args['dry-run']) {
  console.log(`Would create ${path.relative(repoRoot, filePath)}`)
  console.log(body)
  process.exit(0)
}

writeFileSync(filePath, body)
console.log(`Created ${path.relative(repoRoot, filePath)}`)

function parseArgs(raw) {
  const parsed = {}
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (!item.startsWith('--')) continue

    const key = item.slice(2)
    const next = raw[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }

    parsed[key] = next
    index += 1
  }
  return parsed
}

function detectNextWeek(dir) {
  const weeks = readdirSync(dir)
    .map((name) => name.match(/^week(\d+)-.+\.md$/)?.[1])
    .filter(Boolean)
    .map(Number)

  return weeks.length > 0 ? Math.max(...weeks) + 1 : 1
}

function buildTemplate({ title, week, kind, focus }) {
  const intro =
    kind === 'technical-requirements'
      ? `${week}주차에는 ${focus}.`
      : `${week}주차 목표는 ${focus}.`

  return `# ${title}

${intro}

## 목표

- [이번 주 핵심 목표]

## 완료 기준

- [사용자가 확인할 수 있는 완료 상태]
- [필요한 테스트 또는 smoke check]
- [문서/Issue/PR에 남길 결과]

## 현재 상태

- [현재 구현/배포/테스트 상태]
- [아직 확인하지 못한 상태]

## Task 1. [작업명]

목표:

- [작업 목표]

작업 범위:

- [수정 또는 작성할 파일/문서/API]

검증 기준:

- [검증 명령 또는 수동 확인]

## Task 2. [작업명]

목표:

- [작업 목표]

작업 범위:

- [수정 또는 작성할 파일/문서/API]

검증 기준:

- [검증 명령 또는 수동 확인]

## 리스크 및 보류

- [이번 주 범위에서 제외할 항목]
- [별도 issue로 분리할 항목]

## 작업 순서

1. [첫 번째 작업]
2. [두 번째 작업]
3. [검증 및 기록]
`
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
