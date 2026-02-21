import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RebootApiError, signInWithBasic } from "@/lib/reboot-api";

const COOKIE_NAME = "reboot_token";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      identifier?: string;
      password?: string;
    };

    const identifier = body.identifier?.trim();
    const password = body.password?.trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { message: "Identifier and password are required." },
        { status: 400 },
      );
    }

    const token = await signInWithBasic(identifier, password);
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RebootApiError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json({ message: "Unexpected login error." }, { status: 500 });
  }
}
