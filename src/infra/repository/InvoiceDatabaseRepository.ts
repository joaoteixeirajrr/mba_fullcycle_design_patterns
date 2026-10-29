import InvoiceRepository, { InvoiceData } from "../../application/repository/InvoiceRepository";
import DatabaseConnection from "../database/DatabaseConnection";

export default class InvoiceDatabaseRepository implements InvoiceRepository {

	constructor (readonly connection: DatabaseConnection) {
	}

	// Toda a substituicao do periodo acontece dentro de UMA transacao (Unit of Work):
	// o delete das faturas antigas e os inserts das novas. Qualquer falha desfaz tudo (rollback total).
	async replacePeriod(month: number, year: number, type: string, invoices: InvoiceData[]): Promise<void> {
		await this.connection.transaction(async (tx) => {
			await tx.query("delete from branas.invoice where month = $1 and year = $2 and type = $3", [month, year, type]);
			for (const invoice of invoices) {
				await tx.query(
					"insert into branas.invoice (id_contract, month, year, type, date, amount) values ($1, $2, $3, $4, $5, $6)",
					[invoice.idContract, month, year, type, invoice.date, invoice.amount]
				);
			}
		});
	}

	async list(month: number, year: number, type: string): Promise<InvoiceData[]> {
		const rows = await this.connection.query(
			"select id_contract, date, amount from branas.invoice where month = $1 and year = $2 and type = $3 order by date asc",
			[month, year, type]
		);
		return rows.map((row: any) => ({
			idContract: row.id_contract,
			date: row.date,
			amount: parseFloat(row.amount)
		}));
	}

}
