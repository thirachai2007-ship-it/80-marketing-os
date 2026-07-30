import { NextResponse } from "next/server"; import { getSpec55Evidence } from "@/lib/media-buyer/spec-55-evidence";
export const dynamic="force-dynamic"; export const maxDuration=120;
export async function GET(){try{return NextResponse.json({ok:true,...await getSpec55Evidence()});}catch(error){return NextResponse.json({ok:false,status:"NOT_PROVEN",pass:false,error:error instanceof Error?error.message:"SPEC55_FAILED"},{status:500});}}
