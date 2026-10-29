import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import ContractDatabaseRepository from "../src/infra/repository/ContractDatabaseRepository";
import InvoiceDatabaseRepository from "../src/infra/repository/InvoiceDatabaseRepository";
import { InvoiceData } from "../src/application/repository/InvoiceRepository";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
// integration - atomicidade (Unit of Work)
const ID_CONTRATO = "4224a279-c162-4283-86f5-1095f559b08c"; // contrato do seed
const ID_CONTRATO_INEXISTENTE = "00000000-0000-0000-0000-000000000000"; // viola a FK id_contract
let connection: DatabaseConnection;
let contractRepository: ContractDatabaseRepository;
let invoiceRepository: InvoiceDatabaseRepository;
let closeInvoicing: CloseInvoicing;

beforeEach(async () => {
	connection = new PgPromiseAdapter();
	await connection.query("delete from branas.invoice", []);
	contractRepository = new ContractDatabaseRepository(connection);
	invoiceRepository = new InvoiceDatabaseRepository(connection);
	closeInvoicing = new CloseInvoicing(contractRepository, invoiceRepository);
});

afterEach(async () => {
	await connection.query("delete from branas.invoice", []);
	await connection.close();
});

test("Deve fazer rollback total quando uma fatura falha no meio do lote, preservando o fechamento anterior", async function () {
	// 1) Fechamento anterior valido: 1 fatura de 500 em 01/2022 accrual.
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	const antes = await invoiceRepository.list(1, 2022, "accrual");
	expect(antes).toHaveLength(1);
	expect(antes.at(0)?.amount).toBe(500);

	// 2) Novo replacePeriod com uma fatura valida seguida de uma invalida (FK inexistente) no meio do lote.
	const lote: InvoiceData[] = [
		{ idContract: ID_CONTRATO, date: new Date("2022-01-01T13:00:00Z"), amount: 999 },
		{ idContract: ID_CONTRATO_INEXISTENTE, date: new Date("2022-01-01T13:00:00Z"), amount: 123 }
	];
	await expect(invoiceRepository.replacePeriod(1, 2022, "accrual", lote)).rejects.toThrow();

	// 3) Rollback total: o delete das antigas e os inserts das novas foram desfeitos.
	// O fechamento anterior (1 fatura de 500) permanece intacto; nada do lote novo ficou.
	const depois = await invoiceRepository.list(1, 2022, "accrual");
	expect(depois).toHaveLength(1);
	expect(depois.at(0)?.amount).toBe(500);
});
