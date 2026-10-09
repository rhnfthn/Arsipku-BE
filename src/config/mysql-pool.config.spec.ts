import { createPool, Pool } from 'mysql2';
import { getPoolSize, mysqlPoolOptions } from './mysql-pool.config';

interface TestConnection {
  lastActiveTime: number;
  destroy: jest.Mock;
  _realEnd: jest.Mock;
}

interface PoolInternals {
  _allConnections: { push(connection: TestConnection): void };
  _freeConnections: { push(connection: TestConnection): void };
  _removeConnection(connection: TestConnection): void;
}

describe('MySQL pool idle cleanup', () => {
  let pool: Pool;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    pool?.end();
    jest.useRealTimers();
  });

  // Exercise the installed mysql2 cleanup scheduler with stubbed sockets.
  // No connection to any database is opened by these tests.
  function addConnection(idle: boolean): TestConnection {
    const internals = pool as unknown as PoolInternals;
    const connection: TestConnection = {
      lastActiveTime: Date.now(),
      destroy: jest.fn(() => internals._removeConnection(connection)),
      _realEnd: jest.fn((callback: () => void) => callback()),
    };
    internals._allConnections.push(connection);
    if (idle) internals._freeConnections.push(connection);
    return connection;
  }

  it.each([1, 2, 5])('cleans unused connections for pool size %i', (limit) => {
    pool = createPool(mysqlPoolOptions(limit));
    const idle = addConnection(true);
    jest.advanceTimersByTime(62_000);
    expect(idle.destroy).toHaveBeenCalledTimes(1);
  });

  it('expires idle sockets without closing checked-out connections', () => {
    pool = createPool(mysqlPoolOptions(5));
    const idle = addConnection(true);
    const checkedOut = addConnection(false);
    jest.advanceTimersByTime(59_000);
    expect(idle.destroy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3_000);
    expect(idle.destroy).toHaveBeenCalledTimes(1);
    expect(checkedOut.destroy).not.toHaveBeenCalled();
  });

  it('stops the cleanup scheduler when the pool is closed', () => {
    pool = createPool(mysqlPoolOptions(5));
    const idle = addConnection(true);
    pool.end();
    jest.advanceTimersByTime(62_000);
    expect(idle.destroy).not.toHaveBeenCalled();
    expect(idle._realEnd).toHaveBeenCalledTimes(1);
  });

  it('falls back to bounded pool sizes for invalid environment values', () => {
    for (const value of [undefined, '', '0', '-1', '1.5', 'bad']) {
      expect(getPoolSize(value, 5)).toBe(5);
    }
    expect(getPoolSize('3', 5)).toBe(3);
  });
});
