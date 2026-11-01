export interface PastaAnotacao {
    pastaId?: number;
    campanhaId: number;
    nome: string;
    isPublica: boolean;
    criadoEm?: Date;
    // Autor da pasta; ausente em pastas antigas (só o Mestre as altera)
    criadoPorId?: number | null;
}
