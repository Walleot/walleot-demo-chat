import { NextResponse } from 'next/server';
import path from 'path';
import { readFileSync } from 'fs';
const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

export async function GET() {
    const version=packageJson.version;
    return NextResponse.json({ version })
}
