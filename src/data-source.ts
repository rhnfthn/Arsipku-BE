import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { getPoolSize, mysqlPoolOptions } from './config/mysql-pool.config';

config();

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '172.20.16.117',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'arsipku',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  extra: mysqlPoolOptions(getPoolSize(process.env.DB_POOL_SIZE, 5)),
});
