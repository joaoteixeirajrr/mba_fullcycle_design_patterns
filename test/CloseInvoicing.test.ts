import CloseInvoicing from "../src/application/usecase/CloseInvoicing";
import GetInvoices from "../src/application/usecase/GetInvoices";
import ContractDatabaseRepository from "../src/infra/repository/ContractDatabaseRepository";
import InvoiceDatabaseRepository from "../src/infra/repository/InvoiceDatabaseRepository";
import PresenterFactory from "../src/infra/presenter/PresenterFactory";
import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
// integration - fechamento ponta a ponta
let connection: DatabaseConnection;
let contractRepository: ContractDatabaseRepository;
let invoiceRepository: InvoiceDatabaseRepository;
let presenterFactory: PresenterFactory;
let closeInvoicing: CloseInvoicing;
let getInvoices: GetInvoices;

beforeEach(async () => {
	connection = new PgPromiseAdapter();
	await connection.query("delete from branas.invoice", []);
	contractRepository = new ContractDatabaseRepository(connection);
	invoiceRepository = new InvoiceDatabaseRepository(connection);
	presenterFactory = new PresenterFactory();
	closeInvoicing = new CloseInvoicing(contractRepository, invoiceRepository, presenterFactory);
	getInvoices = new GetInvoices(invoiceRepository, presenterFactory);
});

afterEach(async () => {
	await connection.query("delete from branas.invoice", []);
	await connection.close();
});

test("Deve fechar o periodo por competencia, persistir 1 fatura de 500 e torna-la consultavel", async function () {
	const output = await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	expect(output).toHaveLength(1);
	expect(output.at(0)?.date).toEqual(new Date("2022-01-01T13:00:00Z"));
	expect(output.at(0)?.amount).toBe(500);
	const queried = await getInvoices.execute({ month: 1, year: 2022, type: "accrual" });
	expect(queried).toHaveLength(1);
	expect(queried.at(0)?.date).toEqual(new Date("2022-01-01T13:00:00Z"));
	expect(queried.at(0)?.amount).toBe(500);
});

test("Deve reprocessar o mesmo periodo/regime sem duplicar faturas", async function () {
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	await closeInvoicing.execute({ month: 1, year: 2022, type: "accrual" });
	const queried = await getInvoices.execute({ month: 1, year: 2022, type: "accrual" });
	expect(queried).toHaveLength(1);
});

test("Deve responder o fechamento em csv no formato YYYY-MM-DD;amount", async function () {
	const output = await closeInvoicing.execute({ month: 1, year: 2022, type: "cash", format: "csv" });
	expect(output).toBe("2022-01-05;6000");
});

test("Deve lancar Invalid format antes de qualquer efeito quando o formato e desconhecido", async function () {
	await expect(closeInvoicing.execute({ month: 1, year: 2022, type: "accrual", format: "xml" })).rejects.toThrow("Invalid format");
	// nenhum efeito: o periodo continua sem faturas
	const queried = await getInvoices.execute({ month: 1, year: 2022, type: "accrual" });
	expect(queried).toHaveLength(0);
});
