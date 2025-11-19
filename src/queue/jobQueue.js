const { randomUUID } = require('crypto');
const EventEmitter = require('events');

class JobQueue extends EventEmitter {
  constructor({ handler, concurrency = 1, logger }) {
    super();
    if (typeof handler !== 'function') {
      throw new Error('JobQueue requires a handler function');
    }
    this.handler = handler;
    this.concurrency = concurrency;
    this.logger = logger;
    this.queue = [];
    this.inFlight = 0;
    this.jobs = new Map();
  }

  enqueue(payload) {
    const job = {
      id: randomUUID(),
      payload,
      state: 'queued',
      enqueuedAt: new Date(),
      attempts: 0,
    };

    this.queue.push(job);
    this.jobs.set(job.id, job);
    this.emit('queued', job);
    this.#tick();
    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  #tick() {
    while (this.inFlight < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        return;
      }

      this.inFlight += 1;
      job.state = 'active';
      job.attempts += 1;
      job.startedAt = new Date();
      this.emit('started', job);
      Promise.resolve()
        .then(() => this.handler(job))
        .then(() => {
          job.state = 'succeeded';
          job.finishedAt = new Date();
          this.emit('succeeded', job);
        })
        .catch((error) => {
          job.state = 'failed';
          job.finishedAt = new Date();
          job.error = error.message;
          this.emit('failed', job);
          if (job.attempts < 3) {
            // simple retry with exponential back-off
            const delay = 2 ** job.attempts * 1000;
            setTimeout(() => {
              job.state = 'queued';
              job.error = undefined;
              this.queue.push(job);
              this.#tick();
            }, delay);
          }
        })
        .finally(() => {
          this.inFlight -= 1;
          this.#tick();
        });
    }
  }
}

module.exports = JobQueue;


