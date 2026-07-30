import { NextResponse } from "next/server";
import { getSpec54Evidence } from "@/lib/media-buyer/spec-54-evidence";
export const dynamic = "force-dynamic"; export const maxDuration = 120;
export async function GET(){try{return NextResponse.json({ok:true,...await getSpec54Evidence()});}catch(error){return NextResponse.json({ok:false,status:"NOT_PROVEN",pass:false,error:error instanceof Error?error.message:"SPEC54_FAILED"},{status:500});}}
