import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, temperature = 0.7, maxTokens = 2048 } = body;

    const apiKey = process.env.AI_API_KEY;
    const baseUrl = process.env.AI_BASE_URL || 'https://api.deepseek.com';
    const model = process.env.AI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return NextResponse.json(
        { error: '请先配置 AI_API_KEY 环境变量' },
        { status: 400 }
      );
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'AI 服务调用失败' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      content: data.choices?.[0]?.message?.content || '',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '请求失败' },
      { status: 500 }
    );
  }
}
