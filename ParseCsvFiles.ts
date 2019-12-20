import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import { promises } from 'fs';
import { resolve } from 'path';
import * as parse from 'csv-parse/lib/es5';

const CSV_IN_DIR = "../../reports-csv-in";
const XLS_IN_DIR = "../../report-in";
const XLS_OUT_DIR = "../../report-out";

const cols = [2, 3, 4, 5, 8, 9, 10, 11, 12]

const activityTypes = ['מחלה','חופש','חצי חופשה','חצי חופש','עבודה מהבית','מילואים','עבודה אצל לקוח','אחר','חופשה'];

const isTimeActivity = (activity) => (activity && !activityTypes.includes(activity));

const findTimeIn = (row) => (row[9].split(' <— ')[1] );
const findTimeOut = (row) => (row[9].split(' <— ')[0]);

const mapper = (row) => {
  const hasTimes = isTimeActivity(row[9]);
  const timeIn = hasTimes ? findTimeIn(row).replace('*', '') : '';
  const timeOut = hasTimes ? findTimeOut(row).replace('*', '') : '';
  const activity = {
    hours150: row[2],
    hours125: row[3],
    hoursExtra: row[4],
    hoursRegular: row[5],
    hoursTotal: row[8],
    activity: row[9],
    dayType: row[10],
    day: row[11],
    date: row[12],  // 'DD/MM'
    timeIn,
    timeOut,
    hasTimes,
  }
  return Object.values(activity).join(',');
}

const parseCsvString = async (csvString) => {
  return new Promise((resolve1, reject) => {
    const output = []
    parse(csvString, {
      trim: true,
      skip_empty_lines: true
    }).on('readable', function(){
      let record
      while (record = this.read()) {
        output.push(record)
      }
    })
      .on('end', function(){
        resolve1(output);
      })
  })
};

export const handler: Handler = async (event: APIGatewayEvent, context: Context, cb: Callback) => {

  let names;
  try {
    console.info(`Scanning ${resolve(CSV_IN_DIR)}...`)
    names = await promises.readdir(CSV_IN_DIR);
  } catch (e) {
    console.log("e", e);
  }
  if (names === undefined) {
    console.log("CSV files not found");
  } else {
    console.log(`Found ${names.length} files.`);

    for (const fileName of names) {
      // Read file from disk:
      console.info(`Reading ${fileName} from disk...`);

      const csvString = await promises.readFile(`${CSV_IN_DIR}/${fileName}`, 'utf-8');

      // Convert CSV string into rows:
      const rows: Array<Array<string>> = await parseCsvString(csvString) as Array<Array<string>>

      console.info(`Processing ${fileName} ${rows.length} rows.`)
      if (rows && rows.length && rows.length > 1) {
        const headers = rows.shift()
          .filter((col, i) => cols.includes(i))
          .concat(['timeIn', 'timeOut', 'hasTimes'])
          .join(',');
        const body = rows.filter(row => !!row[12])
          .map(mapper)
          .join('\n');

        await promises.writeFile(`${XLS_OUT_DIR}/${fileName}`, `${headers}\n${body}`, 'utf8');

        console.info(`Processed ${fileName} ${body.length} time entries.`)

        // let xlsName;
        // try {
        //   console.info(`Scanning ${resolve(XLS_IN_DIR)}...`)
        //   xlsName = await promises.readdir(XLS_IN_DIR);
        // } catch (e) {
        //   console.log("e", e);
        // }
        // if (xlsName === undefined || !xlsName[0]) {
        //   console.log("XLS file not found");
        // } else {
        //   xlsName = xlsName[0];
        //   console.info(`Editing ${xlsName}...`)
        //
        // }
      }
    }
  }

  // `options` are optional
  // let result1 = await csv.generate({});
  // let result2 = await csv.parse(input, options);
  // let result3 = await csv.transform(data, handler, options);
  // let result4 = await csv.stringify(data, options);

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless Webpack (Typescript) v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  return response;
}
