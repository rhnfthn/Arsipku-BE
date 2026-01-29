import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PositionService } from './position.service';
import { OmPosition } from './entities/om-position.entity';
import { RelationOs } from '../relation_os/entities/relation_os.entity';
import { RelationOsc } from '../relation_osc/entities/relation_osc.entity';
import { DataSource } from 'typeorm';

describe('PositionService', () => {
  let service: PositionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionService,
        {
          provide: getRepositoryToken(OmPosition),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RelationOs),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RelationOsc),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PositionService>(PositionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
