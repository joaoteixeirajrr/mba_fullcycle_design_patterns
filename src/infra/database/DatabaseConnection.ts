// Executor de queries dentro de uma transação. Mesma forma do DatabaseConnection,
// mas ligado a uma transação aberta: todas as queries feitas por ele participam do mesmo commit/rollback.
export interface TransactionExecutor {
	query (statement: string, params: any): Promise<any>;
}

export default interface DatabaseConnection {
	query (statement: string, params: any): Promise<any>;
	// Unit of Work: executa `work` dentro de uma unica transacao. Commit ao final;
	// qualquer excecao lancada dentro de `work` provoca rollback total.
	transaction <T> (work: (tx: TransactionExecutor) => Promise<T>): Promise<T>;
	close (): Promise<void>;
}
