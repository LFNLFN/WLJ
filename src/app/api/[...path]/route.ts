import { NextRequest, NextResponse } from 'next/server';

// 这个文件在 Vercel 上不需要，因为我们会直接在 server 目录运行
// 但保留它以保持开发时的一致性
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'API 服务运行在独立进程中' });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'API 服务运行在独立进程中' });
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({ message: 'API 服务运行在独立进程中' });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ message: 'API 服务运行在独立进程中' });
}
