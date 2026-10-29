import HttpServer from "./HttpServer";
import Usecase from "../../application/usecase/Usecase";

export default class MainController {

	constructor (
		readonly httpServer: HttpServer,
		readonly generateInvoices: Usecase,
		readonly closeInvoicing: Usecase,
		readonly getInvoices: Usecase
	) {
		httpServer.on("post", "/generate_invoices", async function (params: any, body: any, headers: any) {
			const input = body;
			body.userAgent = headers["user-agent"];
			body.host = headers.host;
			const output = await generateInvoices.execute(input);
			return output;
		});
		httpServer.on("post", "/close_invoicing", async function (params: any, body: any, headers: any) {
			const input = body;
			body.userAgent = headers["user-agent"];
			body.host = headers.host;
			const output = await closeInvoicing.execute(input);
			return output;
		});
		httpServer.on("get", "/invoices", async function (params: any, body: any, headers: any, query: any) {
			// month/year chegam como string na query string: convertidos para number aqui.
			const input = {
				month: Number(query.month),
				year: Number(query.year),
				type: query.type,
				format: query.format
			};
			const output = await getInvoices.execute(input);
			return output;
		});
	}
}
