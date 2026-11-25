import { Participant } from '../models/participant-entity';
import {
  buildAssignmentsWithManualOverrides,
  validateManualPairs,
} from './secret-santa-assigner';

function makeParticipants(count: number): Participant[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: String(i + 1),
    name: `Persona ${i + 1}`,
    gifts: [],
    is_ready: true,
  }));
}

describe('secret-santa-assigner', () => {
  it('assigns pinned manual pairs and auto-assigns remaining participants without conflicts', () => {
    const participants = makeParticipants(10);
    const result = buildAssignmentsWithManualOverrides(participants, [
      { giverId: '1', receiverId: '5' },
      { giverId: '2', receiverId: '7' },
      { giverId: '3', receiverId: '1' },
    ]);

    expect(result.valid).toBeTrue();
    expect(result.errors).toEqual([]);
    expect(result.autoAssignedCount).toBe(7);
    expect(result.assignments.length).toBe(10);

    const map = new Map(result.assignments.map((a) => [a.id, a.friend_id]));
    expect(map.get('1')).toBe('5');
    expect(map.get('2')).toBe('7');
    expect(map.get('3')).toBe('1');

    // Bijection and no self-assignment
    const receivers = new Set(result.assignments.map((a) => a.friend_id));
    expect(receivers.size).toBe(10);
    expect(result.assignments.every((a) => a.id !== a.friend_id)).toBeTrue();
  });

  it('scales cleanly up to 50 participants with manual overrides', () => {
    const participants = makeParticipants(50);
    const result = buildAssignmentsWithManualOverrides(participants, [
      { giverId: '1', receiverId: '50' },
      { giverId: '50', receiverId: '25' },
    ]);

    expect(result.valid).toBeTrue();
    expect(result.assignments.length).toBe(50);
    expect(new Set(result.assignments.map((a) => a.friend_id)).size).toBe(50);
    expect(result.assignments.every((a) => a.id !== a.friend_id)).toBeTrue();
  });

  it('rejects self-assignment and provides available suggestions', () => {
    const participants = makeParticipants(4);
    const validation = validateManualPairs(participants, [
      { giverId: '1', receiverId: '1' },
    ]);

    expect(validation.valid).toBeFalse();
    expect(validation.errors[0]).toContain('Persona 1 no puede ser su propio amigo secreto');
    expect(validation.suggestions.length).toBeGreaterThan(0);
  });

  it('rejects duplicate giver and duplicate receiver with suggestions', () => {
    const participants = makeParticipants(4);
    const validation = validateManualPairs(participants, [
      { giverId: '1', receiverId: '2' },
      { giverId: '3', receiverId: '2' },
    ]);

    expect(validation.valid).toBeFalse();
    expect(validation.errors[0]).toContain('Persona 2 fue asignado como amigo secreto a más de un participante');
    expect(validation.suggestions[0]).toContain('Persona 3');
  });

  it('detects forced self-assignment deadlock for remaining participant and suggests a swap', () => {
    const participants = makeParticipants(3);
    const validation = validateManualPairs(participants, [
      { giverId: '1', receiverId: '2' },
      { giverId: '2', receiverId: '1' },
    ]);

    expect(validation.valid).toBeFalse();
    expect(validation.errors[0]).toContain('Persona 3');
    expect(validation.suggestions[0]).toContain('Persona 1 → Persona 3');
  });

  it('flags incomplete manual rows clearly', () => {
    const participants = makeParticipants(4);
    const validation = validateManualPairs(participants, [
      { giverId: '1', receiverId: '' },
    ]);

    expect(validation.valid).toBeFalse();
    expect(validation.errors[0]).toContain('filas incompletas');
  });

  it('preserves non-conflicting previous assignments with minimum disruption', () => {
    // Existing cycle: 1->2, 2->3, 3->4, 4->5, 5->1
    const participants: Participant[] = [
      { id: '1', name: 'P1', friend_id: '2', gifts: [] },
      { id: '2', name: 'P2', friend_id: '3', gifts: [] },
      { id: '3', name: 'P3', friend_id: '4', gifts: [] },
      { id: '4', name: 'P4', friend_id: '5', gifts: [] },
      { id: '5', name: 'P5', friend_id: '1', gifts: [] },
    ];

    // Reassign 1 -> 4 (conflicts only with 3 who previously had 4)
    const first = buildAssignmentsWithManualOverrides(
      participants,
      [{ giverId: '1', receiverId: '4' }],
      { preserveExisting: true }
    );
    expect(first.valid).toBeTrue();
    expect(first.preservedCount).toBe(3); // 2->3, 4->5, 5->1 kept intact
    expect(first.autoAssignedCount).toBe(1); // only 3 reassigned to 2
    const map1 = new Map(first.assignments.map((a) => [a.id, a.friend_id]));
    expect(map1.get('1')).toBe('4');
    expect(map1.get('2')).toBe('3');
    expect(map1.get('3')).toBe('2');
    expect(map1.get('4')).toBe('5');
    expect(map1.get('5')).toBe('1');

    // Second separate manual reassignment: 5 -> 2 (must preserve 1 -> 4!)
    const updatedParticipants = participants.map((p) => ({
      ...p,
      friend_id: map1.get(p.id as string),
    }));
    const second = buildAssignmentsWithManualOverrides(
      updatedParticipants,
      [{ giverId: '5', receiverId: '2' }],
      { preserveExisting: true }
    );
    expect(second.valid).toBeTrue();
    const map2 = new Map(second.assignments.map((a) => [a.id, a.friend_id]));
    expect(map2.get('1')).toBe('4'); // previous manual override conserved!
    expect(map2.get('5')).toBe('2');
    expect(map2.get('2')).toBe('3');
    expect(map2.get('4')).toBe('5');
    expect(map2.get('3')).toBe('1');
  });

  it('resolves singleton self-match deadlock by releasing only one preserved pair', () => {
    // Existing cycle: 1->2, 2->3, 3->4, 4->1; reassign 1->3 leaves only 2->2 unless 1 preserved pair is released
    const participants: Participant[] = [
      { id: '1', name: 'P1', friend_id: '2', gifts: [] },
      { id: '2', name: 'P2', friend_id: '3', gifts: [] },
      { id: '3', name: 'P3', friend_id: '4', gifts: [] },
      { id: '4', name: 'P4', friend_id: '1', gifts: [] },
    ];

    const result = buildAssignmentsWithManualOverrides(
      participants,
      [{ giverId: '1', receiverId: '3' }],
      { preserveExisting: true }
    );

    expect(result.valid).toBeTrue();
    expect(result.preservedCount).toBe(1);
    expect(result.autoAssignedCount).toBe(2);
    expect(result.assignments.every((a) => a.id !== a.friend_id)).toBeTrue();
    expect(new Set(result.assignments.map((a) => a.friend_id)).size).toBe(4);
    expect(result.assignments.find((a) => a.id === '1')?.friend_id).toBe('3');
  });
});
