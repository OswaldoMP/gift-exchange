import type { Participant } from '../models/participant-entity';

export interface SecretSantaAssignment {
  id: string;
  friend_id: string;
}

export interface ManualPairInput {
  giverId: string;
  receiverId: string;
}

export interface AssignmentValidationResult {
  valid: boolean;
  errors: string[];
  suggestions: string[];
}

export interface ManualAssignmentResult extends AssignmentValidationResult {
  assignments: SecretSantaAssignment[];
  autoAssignedCount: number;
  preservedCount: number;
}

export interface AssignmentBuildOptions {
  preserveExisting?: boolean;
  randomFn?: () => number;
}

function shuffle<T>(items: T[], randomFn: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatNameList(ids: string[], nameById: Map<string, string>, limit = 4): string {
  const names = ids.slice(0, limit).map((id) => nameById.get(id) || id);
  if (ids.length > limit) {
    names.push(`y ${ids.length - limit} más`);
  }
  return names.join(', ');
}

export function validateManualPairs(
  participants: Participant[],
  manualPairs: ManualPairInput[]
): AssignmentValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];

  const validIds = participants
    .map((p) => p.id)
    .filter((id): id is string => Boolean(id));
  const idSet = new Set(validIds);
  const nameById = new Map<string, string>(
    participants
      .filter((p): p is Participant & { id: string } => Boolean(p.id))
      .map((p) => [p.id, p.name || `Participante ${p.id}`])
  );

  if (validIds.length < 2) {
    errors.push('Se necesitan al menos 2 participantes para realizar asignaciones.');
    suggestions.push('Agrega más participantes antes de configurar amigos secretos.');
    return { valid: false, errors, suggestions };
  }

  const nonEmptyPairs: ManualPairInput[] = [];
  let hasIncompleteRow = false;

  for (const pair of manualPairs) {
    const giverId = (pair.giverId || '').trim();
    const receiverId = (pair.receiverId || '').trim();
    if (!giverId && !receiverId) {
      continue;
    }
    if (!giverId || !receiverId) {
      hasIncompleteRow = true;
      continue;
    }
    if (!idSet.has(giverId) || !idSet.has(receiverId)) {
      errors.push('Uno de los participantes seleccionados ya no existe en la lista.');
      suggestions.push('Vuelve a seleccionar los participantes desde el listado actualizado.');
      continue;
    }
    nonEmptyPairs.push({ giverId, receiverId });
  }

  if (hasIncompleteRow) {
    errors.push('Hay filas incompletas sin participante o sin amigo secreto seleccionado.');
    suggestions.push('Completa ambos campos en cada fila o elimina las filas vacías.');
  }

  const usedReceivers = new Set(nonEmptyPairs.map((p) => p.receiverId));
  const giverOccurrences = new Map<string, ManualPairInput[]>();
  const receiverOccurrences = new Map<string, ManualPairInput[]>();

  for (const pair of nonEmptyPairs) {
    const giverName = nameById.get(pair.giverId) || pair.giverId;
    const receiverName = nameById.get(pair.receiverId) || pair.receiverId;

    if (pair.giverId === pair.receiverId) {
      errors.push(`${giverName} no puede ser su propio amigo secreto.`);
      const candidates = validIds.filter(
        (id) => id !== pair.giverId && !usedReceivers.has(id)
      );
      if (candidates.length > 0) {
        suggestions.push(
          `Para ${giverName}, elige un amigo secreto disponible como: ${formatNameList(candidates, nameById)}.`
        );
      } else {
        suggestions.push(
          `Libera otro participante asignado para poder emparejar a ${giverName} con alguien distinto.`
        );
      }
    }

    const gList = giverOccurrences.get(pair.giverId) || [];
    gList.push(pair);
    giverOccurrences.set(pair.giverId, gList);

    const rList = receiverOccurrences.get(pair.receiverId) || [];
    rList.push(pair);
    receiverOccurrences.set(pair.receiverId, rList);
  }

  for (const [giverId, pairs] of giverOccurrences.entries()) {
    if (pairs.length > 1) {
      const giverName = nameById.get(giverId) || giverId;
      errors.push(`${giverName} aparece ${pairs.length} veces como participante asignador.`);
      suggestions.push(
        `Deja una sola fila para ${giverName} y elimina las duplicadas.`
      );
    }
  }

  for (const [receiverId, pairs] of receiverOccurrences.entries()) {
    if (pairs.length > 1) {
      const receiverName = nameById.get(receiverId) || receiverId;
      const giversText = pairs
        .map((p) => nameById.get(p.giverId) || p.giverId)
        .join(' y ');
      errors.push(
        `${receiverName} fue asignado como amigo secreto a más de un participante (${giversText}).`
      );
      const secondaryGiver = pairs[pairs.length - 1].giverId;
      const secondaryName = nameById.get(secondaryGiver) || secondaryGiver;
      const freeReceivers = validIds.filter(
        (id) => id !== secondaryGiver && !usedReceivers.has(id)
      );
      if (freeReceivers.length > 0) {
        suggestions.push(
          `Cambia el amigo secreto de ${secondaryName} por uno disponible: ${formatNameList(freeReceivers, nameById)}.`
        );
      } else {
        suggestions.push(
          `Intercambia el amigo secreto de ${secondaryName} con otro participante para evitar duplicados.`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, suggestions };
  }

  // Check remaining unassigned subset for impossible forced self-assignment
  const pinnedGivers = new Set(nonEmptyPairs.map((p) => p.giverId));
  const pinnedReceivers = new Set(nonEmptyPairs.map((p) => p.receiverId));
  const remainingGivers = validIds.filter((id) => !pinnedGivers.has(id));
  const remainingReceivers = validIds.filter((id) => !pinnedReceivers.has(id));

  if (
    remainingGivers.length === 1 &&
    remainingReceivers.length === 1 &&
    remainingGivers[0] === remainingReceivers[0]
  ) {
    const trappedId = remainingGivers[0];
    const trappedName = nameById.get(trappedId) || trappedId;
    errors.push(
      `Con estas asignaciones manuales, ${trappedName} quedaría sin opción y tendría que regalarse a sí mismo.`
    );

    const swapCandidate = nonEmptyPairs.find(
      (p) => p.giverId !== trappedId && p.receiverId !== trappedId
    );
    if (swapCandidate) {
      const gName = nameById.get(swapCandidate.giverId) || swapCandidate.giverId;
      const rName = nameById.get(swapCandidate.receiverId) || swapCandidate.receiverId;
      suggestions.push(
        `Cambia la asignación de ${gName} → ${trappedName} para que el sistema asigne automáticamente ${trappedName} → ${rName}.`
      );
    } else {
      suggestions.push(
        `Elimina al menos una asignación manual para dejar margen al sistema y evitar que ${trappedName} quede solo.`
      );
    }
    return { valid: false, errors, suggestions };
  }

  return { valid: true, errors: [], suggestions: [] };
}

function buildDerangementBijection(
  givers: string[],
  receivers: string[],
  randomFn: () => number
): SecretSantaAssignment[] {
  const count = givers.length;
  if (count === 0) {
    return [];
  }
  if (count === 1) {
    if (givers[0] === receivers[0]) {
      throw new Error('Imposible completar asignación sin auto-asignación.');
    }
    return [{ id: givers[0], friend_id: receivers[0] }];
  }

  // Try random shuffles first for uniform randomness
  for (let attempt = 0; attempt < 25; attempt++) {
    const shuffledReceivers = shuffle(receivers, randomFn);
    if (!shuffledReceivers.some((rId, idx) => rId === givers[idx])) {
      return givers.map((gId, idx) => ({
        id: gId,
        friend_id: shuffledReceivers[idx],
      }));
    }
  }

  // Deterministic guaranteed constructive fallback (always valid for count >= 2)
  const receiverSet = new Set(receivers);
  const shared = shuffle(
    givers.filter((id) => receiverSet.has(id)),
    randomFn
  );
  const sharedSet = new Set(shared);
  const giversOnly = shuffle(
    givers.filter((id) => !sharedSet.has(id)),
    randomFn
  );
  const receiversOnly = shuffle(
    receivers.filter((id) => !sharedSet.has(id)),
    randomFn
  );

  const result: SecretSantaAssignment[] = [];

  if (shared.length === 0) {
    for (let i = 0; i < giversOnly.length; i++) {
      result.push({ id: giversOnly[i], friend_id: receiversOnly[i] });
    }
    return result;
  }

  if (shared.length === 1) {
    const soleShared = shared[0];
    const [firstFreeReceiver, ...restFreeReceivers] = receiversOnly;
    result.push({ id: soleShared, friend_id: firstFreeReceiver });

    const remainingReceivers = shuffle([soleShared, ...restFreeReceivers], randomFn);
    for (let i = 0; i < giversOnly.length; i++) {
      result.push({ id: giversOnly[i], friend_id: remainingReceivers[i] });
    }
    return result;
  }

  // shared.length >= 2: cyclic shift on shared + zip disjoint sets
  for (let i = 0; i < shared.length; i++) {
    result.push({
      id: shared[i],
      friend_id: shared[(i + 1) % shared.length],
    });
  }
  for (let i = 0; i < giversOnly.length; i++) {
    result.push({ id: giversOnly[i], friend_id: receiversOnly[i] });
  }
  return result;
}

export function buildAssignmentsWithManualOverrides(
  participants: Participant[],
  manualPairs: ManualPairInput[],
  optionsOrRandom: AssignmentBuildOptions | (() => number) = {}
): ManualAssignmentResult {
  const options: AssignmentBuildOptions =
    typeof optionsOrRandom === 'function'
      ? { randomFn: optionsOrRandom, preserveExisting: false }
      : optionsOrRandom;
  const randomFn = options.randomFn ?? Math.random;
  const preserveExisting = Boolean(options.preserveExisting);

  const validation = validateManualPairs(participants, manualPairs);
  if (!validation.valid) {
    return {
      ...validation,
      assignments: [],
      autoAssignedCount: 0,
      preservedCount: 0,
    };
  }

  const validIds = participants
    .map((p) => p.id)
    .filter((id): id is string => Boolean(id));
  const idSet = new Set(validIds);

  const pinned: SecretSantaAssignment[] = manualPairs
    .filter((p) => p.giverId?.trim() && p.receiverId?.trim())
    .map((p) => ({
      id: p.giverId.trim(),
      friend_id: p.receiverId.trim(),
    }));

  const usedGivers = new Set(pinned.map((p) => p.id));
  const usedReceivers = new Set(pinned.map((p) => p.friend_id));

  const preserved: SecretSantaAssignment[] = [];

  if (preserveExisting) {
    for (const participant of participants) {
      const giverId = participant.id;
      const existingFriendId = participant.friend_id;
      if (
        !giverId ||
        !existingFriendId ||
        giverId === existingFriendId ||
        !idSet.has(existingFriendId) ||
        usedGivers.has(giverId) ||
        usedReceivers.has(existingFriendId)
      ) {
        continue;
      }
      preserved.push({ id: giverId, friend_id: existingFriendId });
      usedGivers.add(giverId);
      usedReceivers.add(existingFriendId);
    }
  }

  let remainingGivers = validIds.filter((id) => !usedGivers.has(id));
  let remainingReceivers = validIds.filter((id) => !usedReceivers.has(id));

  // If preserving non-conflicting pairs leaves a single participant forced to match themselves,
  // release just ONE preserved pair (minimum disruption) to guarantee a valid derangement.
  if (
    remainingGivers.length === 1 &&
    remainingReceivers.length === 1 &&
    remainingGivers[0] === remainingReceivers[0] &&
    preserved.length > 0
  ) {
    const released = preserved.pop() as SecretSantaAssignment;
    usedGivers.delete(released.id);
    usedReceivers.delete(released.friend_id);
    remainingGivers = validIds.filter((id) => !usedGivers.has(id));
    remainingReceivers = validIds.filter((id) => !usedReceivers.has(id));
  }

  const autoAssigned = buildDerangementBijection(
    remainingGivers,
    remainingReceivers,
    randomFn
  );

  const byId = new Map<string, string>();
  for (const item of [...pinned, ...preserved, ...autoAssigned]) {
    byId.set(item.id, item.friend_id);
  }

  const orderedAssignments: SecretSantaAssignment[] = validIds.map((id) => ({
    id,
    friend_id: byId.get(id) as string,
  }));

  return {
    valid: true,
    errors: [],
    suggestions: [],
    assignments: orderedAssignments,
    autoAssignedCount: autoAssigned.length,
    preservedCount: preserved.length,
  };
}
