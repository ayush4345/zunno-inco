class TrackingRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async upsertGameSession(payload) {
    await this.prisma.gameSession.upsert({
      where: {
        game_sessions_chain_id_game_id: {
          chainId: payload.chainId,
          gameId: String(payload.gameId),
        },
      },
      create: {
        chainId: payload.chainId,
        gameId: String(payload.gameId),
        roomId: payload.roomId,
        ownerAddress: payload.ownerAddress,
        isPrivate: Boolean(payload.isPrivate),
        gameCodeHash: payload.gameCodeHash || null,
        status: payload.status || 'not_started',
      },
      update: {
        roomId: payload.roomId,
        ownerAddress: payload.ownerAddress,
        isPrivate: Boolean(payload.isPrivate),
        gameCodeHash: payload.gameCodeHash || null,
        status: payload.status || 'not_started',
      },
    });
  }

  async updateGameStatus(payload) {
    await this.prisma.gameSession.updateMany({
      where: {
        chainId: payload.chainId,
        gameId: String(payload.gameId),
      },
      data: {
        status: payload.status,
      },
    });
  }

}

module.exports = TrackingRepository;
