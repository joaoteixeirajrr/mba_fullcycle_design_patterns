import HttpServer from "./HttpServer";
import Usecase from "../../application/usecase/Usecase";

export default class MainController {

	constructor (
		readonly httpServer: HttpServer,
		readonly generateInvoices: Usecase,
		readonly closeInvoicing: Usecase
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
	}
}
