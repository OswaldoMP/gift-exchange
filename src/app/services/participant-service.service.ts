import { Injectable } from '@angular/core';
import { Participant } from '../models/participant-entity';
import { Gift } from '../models/Gift';

@Injectable({
  providedIn: 'root'
})
export class ParticipantServiceService {

  constructor() { }

  private currentParticipant: Participant = {
    id: "1",
    name: "Adrian",
    gifts: [{
      id: "1",
      title: "Camara",
      store: "Camara Exterior",
    },
    {
      id: "2",
      title: "Camara",
      store: "Camara Exterior",
    },
    {
      id: "3",
      title: "Camara",
      store: "Camara Exterior",
    }],
  }

  private participantList: Participant[] = [
    {
      id: "1",
      name: "Adrian",
      gifts: [{
        id: "4",
        title: "Camara",
        store: "Camara Exterior",
      },
      {
        id: "5",
        title: "Camara",
        store: "Camara Exterior",
      },
      {
        id: "6",
        title: "Camara",
        store: "Camara Exterior",
      }],
    }, {
      id: "2",
      name: "Ramon",
      gifts: [{
        id: "7",
        title: "Camara",
        store: "Camara Exterior",
      },
      {
        id: "8",
        title: "Camara",
        store: "Camara Exterior",
      }],
    },
    {
      id: "3",
      name: "Osman",
      gifts: [],
    },
    {
      id: "4",
      name: "Fer",
      gifts: [],
    }
  ]


  getCurrentParticipant(): Participant {
    return this.currentParticipant;
  }

  getParticipants(): Participant[] {
    return this.participantList;
  }

  getDrawnStatu(): boolean {
    return false;
  }

  addNewGift(gift: Gift) {
    // Save to db =
    this.currentParticipant.gifts.push(gift);
  }

  removeGift(gift: Gift) {

    this.currentParticipant.gifts = this.currentParticipant.gifts.filter((current) => current.id !== gift.id);

  }

}
