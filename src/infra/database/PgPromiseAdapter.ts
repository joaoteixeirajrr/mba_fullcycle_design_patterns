import DatabaseConnection, { TransactionExecutor } from "./DatabaseConnection";
import pgp from "pg-promise";

export default class PgPromiseAdapter implements DatabaseConnection {
	connection: any;

	constructor () {
		this.connection = pgp()("postgres://postgres:123456@localhost:5432/app");
	}

	query(statement: string, params: any): Promise<any> {
		return this.connection.query(statement, params);
	}

	// Unit of Work sobre o suporte nativo de transacoes do pg-promise.
	// O callback `work` recebe um executor que roteia as queries para a mesma transacao `t`.
	// Se `work` lancar, o pg-promise faz ROLLBACK; caso contrario, COMMIT.
	transaction<T>(work: (tx: TransactionExecutor) => Promise<T>): Promise<T> {
		return this.connection.tx((t: any) => {
			const executor: TransactionExecutor = {
				query: (statement: string, params: any) => t.query(statement, params)
			};
			return work(executor);
		});
	}

	close(): Promise<void> {
		return this.connection.$pool.end();
	}

}
