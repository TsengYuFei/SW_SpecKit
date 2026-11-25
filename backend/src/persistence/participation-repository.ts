import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { answersSchema, groupNameSchema } from '@classroom/shared/schemas/activity';
import type { DatabaseConnection } from './connection.js';
import type { ActivityRepository } from './activity-repository.js';
import { AppError } from '../security/safe-errors.js';

export function createParticipationRepository(
  connection: DatabaseConnection,
  activities: ActivityRepository,
) {
  const db = connection.database;
  function findParticipant(digest: string) {
    const row = db.prepare('SELECT id FROM participants WHERE browser_token_digest=?').get(
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(digest),
    );
    return row ? { id: String(row.id) } : undefined;
  }
  return {
    transaction: <T>(action: () => T) => connection.transaction(action),
    findParticipant,
    participant(digest: string) {
      connection.requireTransaction();
      const prior = findParticipant(digest);
      if (prior) return prior;
      const id = randomUUID();
      db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id, digest, Date.now());
      return { id };
    },
    join(activityId: string, groupId: string, participantId: string, inputName: string) {
      connection.requireTransaction();
      const activity = activities.require(activityId);
      if (activity.phase === 'ended') throw new AppError('INVALID_PHASE');
      const name = groupNameSchema.parse(inputName);
      const groups = activities.groups(activityId);
      const existing = groups.find((group) => group.participantId === participantId);
      if (existing) {
        if (existing.id !== groupId) throw new AppError('ALREADY_JOINED');
        if (existing.name !== name) throw new AppError('NAME_LOCKED');
        return existing;
      }
      const group = groups.find((group) => group.id === groupId);
      if (!group) throw new AppError('INVALID_INPUT');
      if (group.participantId) throw new AppError('GROUP_OCCUPIED');
      db.prepare(
        'UPDATE activity_groups SET participant_id=?,name=?,joined_at=? WHERE activity_id=? AND id=? AND participant_id IS NULL',
      ).run(participantId, name, Date.now(), activityId, groupId);
      db.prepare('UPDATE activities SET revision=revision+1 WHERE id=?').run(activityId);
      return { ...group, participantId, name };
    },
    submit(
      activityId: string,
      participantId: string,
      questionId: string,
      requestId: string,
      inputAnswers: Record<string, string>,
    ) {
      connection.requireTransaction();
      const activity = activities.require(activityId);
      if (activity.phase !== 'active') throw new AppError('INVALID_PHASE');
      const group = activities
        .groups(activityId)
        .find((group) => group.participantId === participantId);
      if (!group) throw new AppError('FORBIDDEN');
      const question = activity.source.questions.find((question) => question.id === questionId);
      if (
        !question ||
        Object.keys(inputAnswers).length !== question.items.length ||
        question.items.some((item) => !Object.hasOwn(inputAnswers, item.id))
      )
        throw new AppError('INCOMPLETE_ANSWERS');
      const answers = answersSchema.parse(inputAnswers);
      if (
        db
          .prepare(
            'SELECT id FROM submissions WHERE activity_id=? AND group_id=? AND question_id=?',
          )
          .get(activityId, group.id, questionId)
      )
        throw new AppError('ALREADY_SUBMITTED');
      const id = randomUUID();
      const receivedAt = Date.now();
      db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?)').run(
        activityId,
        id,
        group.id,
        questionId,
        z.uuid().parse(requestId),
        receivedAt,
        activity.nextSequence,
      );
      for (const item of question.items)
        db.prepare('INSERT INTO submission_answers VALUES(?,?,?,?,?)').run(
          activityId,
          id,
          questionId,
          item.id,
          answers[item.id]!,
        );
      db.prepare(
        'UPDATE activities SET next_sequence=next_sequence+1,revision=revision+1 WHERE id=?',
      ).run(activityId);
      return {
        id,
        groupId: group.id,
        questionId,
        answers,
        receivedAt,
        sequence: activity.nextSequence,
      };
    },
  };
}
export type ParticipationRepository = ReturnType<typeof createParticipationRepository>;
