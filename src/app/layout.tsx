import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "未来家儿童能力发展中心 - 课程管理系统",
  description: "轻松管理课程、学生和教师信息",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
