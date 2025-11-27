import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Participant } from '../models/participant-entity';
import { Gift } from '../models/Gift';
import { ParticipantServiceService } from '../services/participant-service.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // templateUrl: './exchange.component.html',
  templateUrl: './exchange.component.html',
  styleUrl: './exchange.component.css'
})
export class ExchangeComponent {

currentUser!: Participant;
participants: Participant[] = [];
drawResult: boolean = false ;


expandedUserId: string | null = null;
selectedGift: Gift | null = null;
newGift: Gift | null = null;

constructor(
  public participantService: ParticipantServiceService
) {
  this.currentUser = participantService.getCurrentParticipant();
  this.participants = participantService.getParticipants();
  this.drawResult = participantService.getDrawnStatu();
} 

// Computed
get isDrawn() {
  return this.drawResult;
  // return this.drawResult === false;
}


get myAssignedFriend(): Participant | null {
if (!this.isDrawn) return null;

return this.participants.find(p => p.id === "2") || null;
}

get canAddGift(): boolean {
  return this.currentUser.gifts.length < 5;
}


// UI actions
toggleUserExpand(userId: string) {
this.expandedUserId = this.expandedUserId === userId ? null : userId;
}


openGift(gift: Gift) {
this.selectedGift = gift;
// prevent background scroll if wanted
document.body.style.overflow = 'hidden';
}

openDialogNewGift() {
  this.newGift = {
    id: "",
    title: "",
    store: "",
    link: ""
  }
  document.body.style.overflow = 'hidden'; 
}


closeGift() {
this.selectedGift = null;
this.newGift = null;
document.body.style.overflow = '';

// Refresh
// this.currentUser = this.participantService.getCurrentParticipant();
}


// Placeholder: función para disparar el sorteo (probablemente en el backend)
requestDraw() {
// emit event o llamada a servicio; aquí solo un ejemplo de cómo se podría indicar
console.log('Solicitar sorteo al backend...');
}

addGift(gift: Gift) {
  this.participantService.addNewGift(gift);  
  this.closeGift();
}

removeGift(gift: Gift) {
  this.participantService.removeGift(gift);
  this.closeGift();
}

}



