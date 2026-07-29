ALTER TABLE "ContentAnalysis" ADD COLUMN "inputEvidenceJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ContentAnalysis" ADD COLUMN "visibleTextJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ContentAnalysis" ADD COLUMN "visualObservationsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ContentAnalysis" ADD COLUMN "contextObservationsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ContentAnalysis" ADD COLUMN "modalityAnalysisVersion" INTEGER NOT NULL DEFAULT 1;
