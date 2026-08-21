import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('textes_lois')
export class TexteLoi {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'titre_loi', type: 'varchar', length: 255 })
  titreLoi: string;

  @Column({ name: 'nom_fichier', type: 'varchar', length: 255 })
  nomFichier: string;

  @Column({ name: 'section_titre', type: 'varchar', length: 255, nullable: true })
  sectionTitre: string | null;

  @Column({ name: 'contenu', type: 'text' })
  contenu: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
