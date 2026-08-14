const logger = require('../logger');
const { getPool, isTrackingEnabled, getDefaultChainId } = require('../config/postgres');
const TrackingRepository = require('./repository');
const TrackingQueue = require('./queue');

class TrackingService {
  constructor() {
    this.enabled = isTrackingEnabled();
    this.defaultChainId = getDefaultChainId();
    this.queue = null;
    this.repository = null;

    if (this.enabled) {
      const pool = getPool();
      if (!pool) {
        this.enabled = false;
      } else {
        this.repository = new TrackingRepository(pool);
        this.queue = new TrackingQueue({
          flushMs: Number(process.env.TRACKING_QUEUE_FLUSH_MS || 2000),
          batchSize: Number(process.env.TRACKING_QUEUE_BATCH_SIZE || 50),
          processEvent: (event) => this.processEvent(event),
        });
        this.queue.start();
      }
    }

    logger.info('[Tracking] service initialized enabled=%s', this.enabled);
  }

  getStatus() {
    return {
      enabled: this.enabled,
      queueSize: this.queue ? this.queue.getSize() : 0,
      defaultChainId: this.defaultChainId,
    };
  }

  enqueue(type, payload) {
    if (!this.enabled || !this.queue) {
      return { accepted: false, reason: 'tracking_disabled' };
    }

    this.queue.enqueue({ type, payload });
    return { accepted: true };
  }

  enqueueGameSessionUpsert(payload) {
    const normalized = {
      chainId: Number(payload.chainId || this.defaultChainId),
      gameId: String(payload.gameId),
      roomId: payload.roomId,
      ownerAddress: payload.ownerAddress || '0x0000000000000000000000000000000000000000',
      isPrivate: Boolean(payload.isPrivate),
      gameCodeHash: payload.gameCodeHash || null,
      status: payload.status || 'not_started',
    };

    return this.enqueue('UPSERT_GAME_SESSION', normalized);
  }

  enqueueGameStatusUpdate(payload) {
    return this.enqueue('UPDATE_GAME_STATUS', {
      chainId: Number(payload.chainId || this.defaultChainId),
      gameId: String(payload.gameId),
      status: payload.status,
    });
  }

  async processEvent(event) {
    if (!this.repository) return;

    switch (event.type) {
      case 'UPSERT_GAME_SESSION':
        await this.repository.upsertGameSession(event.payload);
        break;
      case 'UPDATE_GAME_STATUS':
        await this.repository.updateGameStatus(event.payload);
        break;
      default:
        logger.warn('[Tracking] Unknown event type: %s', event.type);
    }
  }
}

module.exports = new TrackingService();
