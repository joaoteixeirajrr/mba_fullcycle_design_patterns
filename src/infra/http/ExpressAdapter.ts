import HttpServer from "./HttpServer";
import express from "express";

export default class ExpressAdapter implements HttpServer {
	app: any;

	constructor () {
		this.app = express();
		this.app.use(express.json());
	}

	// Convencao do contrato (sem vazar Express): o callback recebe, nesta ordem,
	// (params, body, headers, query). A query string e o 4o argumento.
	on(method: string, url: string, callback: Function): void {
		this.app[method](url, async function (req: any, res: any) {
			const output = await callback(req.params, req.body, req.headers, req.query);
			// Output string (ex.: CSV) vira texto puro; objeto/array mantem a serializacao JSON.
			if (typeof output === "string") {
				res.send(output);
			} else {
				res.json(output);
			}
		});
	}

	listen(port: number): void {
		this.app.listen(port);
	}

}
