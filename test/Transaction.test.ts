import DatabaseConnection from "../src/infra/database/DatabaseConnection";
import PgPromiseAdapter from "../src/infra/database/PgPromiseAdapter";
// integration - prova do Unit of Work na conexao
let connection: DatabaseConnection;

beforeEach(async () => {
	connection = new PgPromiseAdapter();
	await connection.query("create table if not exists branas.tx_probe (id integer primary key, label text)", []);
	await connection.query("truncate table branas.tx_probe", []);
});

afterEach(async () => {
	await connection.query("drop table if exists branas.tx_probe", []);
	await connection.close();
});

test("Deve efetivar (commit) tudo quando a transacao conclui sem erro", async function () {
	await connection.transaction(async (tx) => {
		await tx.query("insert into branas.tx_probe (id, label) values ($1, $2)", [1, "a"]);
		await tx.query("insert into branas.tx_probe (id, label) values ($1, $2)", [2, "b"]);
	});
	const rows = await connection.query("select count(*)::int as count from branas.tx_probe", []);
	expect(rows[0].count).toBe(2);
});

test("Deve desfazer (rollback) tudo quando uma query falha no meio do lote", async function () {
	await expect(connection.transaction(async (tx) => {
		await tx.query("insert into branas.tx_probe (id, label) values ($1, $2)", [1, "a"]);
		// chave primaria duplicada: viola constraint no meio do lote
		await tx.query("insert into branas.tx_probe (id, label) values ($1, $2)", [1, "dup"]);
		await tx.query("insert into branas.tx_probe (id, label) values ($1, $2)", [2, "b"]);
	})).rejects.toThrow();
	// nenhuma linha deve ter sobrevivido: rollback total
	const rows = await connection.query("select count(*)::int as count from branas.tx_probe", []);
	expect(rows[0].count).toBe(0);
});
