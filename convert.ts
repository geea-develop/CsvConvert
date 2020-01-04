import {Context, Handler, S3CreateEvent} from 'aws-lambda';

;
import * as parse from 'csv-parse/lib/es5';
import * as AWS from 'aws-sdk';

var s3 = new AWS.S3();

const cols = [2, 3, 4, 5, 8, 9, 10, 11, 12]

const activityTypes = ['מחלה', 'חופש', 'חצי חופשה', 'חצי חופש', 'עבודה מהבית', 'מילואים', 'עבודה אצל לקוח', 'אחר', 'חופשה'];

const isTimeActivity = (activity) => (activity && !activityTypes.includes(activity));
const isMultipleTimeActivity = (activity) => (activity && activity.includes('\r'));

const findTimeIn = (time) => (time.split(' <— ')[1]);
const findTimeOut = (time) => (time.split(' <— ')[0]);

const mapper = (row) => {
    const rawTime = row[9];
    const hasTimes = isTimeActivity(rawTime);
    const hasMultipleTimes = isMultipleTimeActivity(rawTime);
    let timeIn = '';
    let timeOut = '';
    if (hasTimes && hasMultipleTimes) {
        const multipleTimes = rawTime.split('\r')
        let aggregatedTime = 0;
        multipleTimes.forEach(parsedTime => {
            const tIn = findTimeIn(parsedTime).replace('*', '');
            const tOut = findTimeOut(parsedTime).replace('*', '');
            const tInHours = parseInt(tIn.slice(0, 2));
            const tOutHours = parseInt(tOut.slice(0, 2));

            aggregatedTime += (tOutHours - tInHours)
            timeIn = timeIn ? timeIn : tIn
            timeOut = (parseInt(timeIn.slice(0, 2)) + aggregatedTime).toString() + ':00';
        })
    } else if (hasTimes) {
        timeIn = findTimeIn(rawTime).replace('*', '');
        timeOut = findTimeOut(rawTime).replace('*', '');
    }

    const activity = {
        hours150: row[2],
        hours125: row[3],
        hoursExtra: row[4],
        hoursRegular: row[5],
        hoursTotal: row[8],
        activity: row[9].replace('\r', ' '),
        dayType: row[10],
        day: row[11],
        date: row[12],  // 'DD/MM'
        timeIn,
        timeOut,
        hasTimes,
    }
    return Object.values(activity)
    // .join(',');
}

const parseCsvString = async (csvString) => {
    return new Promise((resolve1, reject) => {
        const output = []
        parse(csvString, {
            trim: true,
            skip_empty_lines: true
        }).on('readable', function () {
            let record
            while (record = this.read()) {
                output.push(record)
            }
        })
          .on('end', function () {
              resolve1(output);
          })
    })
};

export const handler: Handler = async (event: S3CreateEvent, context: Context) => {

    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey =
      decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    const res = await s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
    }).promise();

    console.info(`Reading ${srcKey} from ${srcBucket}...`);

    const csvString = res && res.Body ? res.Body.toString() : '';

    if (!csvString) throw new Error('invalid csv file');

    // Convert CSV string into rows:
    const rows: Array<Array<string>> = await parseCsvString(csvString) as Array<Array<string>>

    console.info(`Processing ${srcKey} ${rows.length} rows.`)
    if (rows && rows.length && rows.length > 1) {
        const headers = rows.shift()
          .filter((col, i) => cols.includes(i))
          .concat(['זמן כניסה', 'זמן יציאה', 'נמצאו זמנים'])
          .join(',');

        const body = rows.filter(row => !!row[12])
          .map(mapper)
          .join('\n');

        console.info(`Processed ${srcKey} ${body.length} time entries.`)

        const content = `${headers}\n${body}`;
        const res = await s3.upload({
            Bucket: srcBucket,
            Key: `${srcKey.slice('uploads/'.length, srcKey.length)}`,
            Body: content,
        }).promise();

        console.log(res);
    }

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Go Serverless Webpack (Typescript) v1.0! Your function executed successfully!',
            input: event,
        }),
    };

    return response;
}
