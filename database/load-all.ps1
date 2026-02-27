param(
  [String]$dataDir,
  [String]$dbPropsFile,
  [String]$jarFile
)
$ErrorActionPreference = "Stop"

java -cp $jarFile splmonger.loaders.SplTerminologiesDownloader $dataDir/terminologies
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.GinasLoader $dataDir/UNII_Records.txt $dbPropsFile ginas
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.MeddraReleaseLoader $dataDir/meddra/MedAscii $dbPropsFile meddra
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.MedRTLoader $dataDir/Core_MEDRT_XML.xml $dbPropsFile medrt
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.SplLoader --batch-inserts --max-failures 50 --init-truncate $dataDir/dailymed/labeling $dataDir/terminologies $dataDir/dailymed/fda_initiated_inactive_ndcs_indexing_spl_files.zip $dbPropsFile spl
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.SplSectionMeddraTermOccurrenceLoader --max-failures 50 $dataDir/dailymed/labeling $dbPropsFile meddra spl
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.SubstanceMedRTClassLoader $dataDir/dailymed/pharmacologic_class_indexing_spl_files.zip $dbPropsFile spl
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.RxNormReleaseLoader $dataDir/rxnorm/rrf $dbPropsFile rxnorig
if(!$?) { Exit $LASTEXITCODE }
java -cp $jarFile splmonger.loaders.RxNormRelationalLoader $dbPropsFile rxnrel
if(!$?) { Exit $LASTEXITCODE }

