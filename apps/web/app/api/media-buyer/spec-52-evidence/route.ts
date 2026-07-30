import { NextResponse } from "next/server";
import { getSpec52Evidence } from "@/lib/media-buyer/spec-52-evidence";
export const dynamic="force-dynamic"; export const maxDuration=120;
export async function GET(){try{return NextResponse.json({ok:true,...await getSpec52Evidence()});}catch(error){return NextResponse.json({ok:false,status:"NOT_PROVEN",pass:false,error:error instanceof Error?error.message:"SPEC52_FAILED"},{status:500});}}
