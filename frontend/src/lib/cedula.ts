/**
 * Mapeo oficial y utilidades para Cédulas de Identidad de Nicaragua.
 * Formato estándar: 001-280490-0001A (14 dígitos alfanuméricos)
 */

const PREFIJOS_DEPARTAMENTOS: Record<string, string> = {
  // Managua
  '001': 'Managua (Distrito Central)',
  '002': 'Managua (Tipitapa)',
  '003': 'Managua (Villa El Carmen)',
  '004': 'Managua (San Rafael del Sur)',
  '005': 'Managua (San Francisco Libre)',
  '006': 'Managua (Ticuantepe)',
  '007': 'Managua (Mateare)',
  '008': 'Managua (Ciudad Sandino)',
  '009': 'Managua (El Crucero)',
  // Carazo
  '041': 'Carazo (Jinotepe)',
  '042': 'Carazo (Diriamba)',
  '043': 'Carazo (San Marcos)',
  '044': 'Carazo (Santa Teresa)',
  '045': 'Carazo (Dolores)',
  '046': 'Carazo (La Paz)',
  '047': 'Carazo (El Rosario)',
  '048': 'Carazo (La Conquista)',
  // Chinandega
  '081': 'Chinandega (Cabecera)',
  '082': 'Chinandega (Corinto)',
  '083': 'Chinandega (Chichigalpa)',
  '084': 'Chinandega (Posoltega)',
  '085': 'Chinandega (El Realejo)',
  '086': 'Chinandega (Puerto Morazán)',
  '087': 'Chinandega (Somotillo)',
  '088': 'Chinandega (Villa Nueva)',
  '089': 'Chinandega (Santo Tomás del Norte)',
  '090': 'Chinandega (Cinco Pinos)',
  '091': 'Chinandega (San Pedro del Norte)',
  '092': 'Chinandega (El Viejo)',
  // Chontales
  '121': 'Chontales (Juigalpa)',
  '122': 'Chontales (Acoyapa)',
  '123': 'Chontales (Santo Tomás)',
  '124': 'Chontales (Comalapa)',
  '125': 'Chontales (San Pedro de Lóvago)',
  '126': 'Chontales (La Libertad)',
  '127': 'Chontales (Santo Domingo)',
  '128': 'Chontales (Villa Sandino)',
  '129': 'Chontales (Cuapa)',
  '130': 'Chontales (El Coral)',
  // Estelí
  '161': 'Estelí (Cabecera)',
  '162': 'Estelí (Pueblo Nuevo)',
  '163': 'Estelí (Condega)',
  '164': 'Estelí (San Juan de Limay)',
  '165': 'Estelí (La Trinidad)',
  '166': 'Estelí (San Nicolás)',
  // Granada
  '201': 'Granada (Cabecera)',
  '202': 'Granada (Nandaime)',
  '203': 'Granada (Diriomo)',
  '204': 'Granada (Diriá)',
  // Jinotega
  '241': 'Jinotega (Cabecera)',
  '242': 'Jinotega (San Rafael del Norte)',
  '243': 'Jinotega (San Sebastián de Yalí)',
  '244': 'Jinotega (La Concordia)',
  '245': 'Jinotega (San José de Bocay)',
  '246': 'Jinotega (El Cuá)',
  '247': 'Jinotega (Santa María de Pantasma)',
  '248': 'Jinotega (Wiwilí de Jinotega)',
  // León
  '281': 'León (Cabecera)',
  '282': 'León (El Sauce)',
  '283': 'León (Achuapa)',
  '284': 'León (Santa Rosa del Peñón)',
  '285': 'León (El Jicaral)',
  '286': 'León (Larreynaga - Malpaisillo)',
  '287': 'León (Telica)',
  '288': 'León (Quezalguaque)',
  '289': 'León (Nagarote)',
  '290': 'León (La Paz Centro)',
  // Madriz
  '321': 'Madriz (Somoto)',
  '322': 'Madriz (Telpaneca)',
  '323': 'Madriz (San Juan de Río Coco)',
  '324': 'Madriz (Palacagüina)',
  '325': 'Madriz (Yalagüina)',
  '326': 'Madriz (Totogalpa)',
  '327': 'Madriz (Lucas)',
  '328': 'Madriz (Las Sabanas)',
  '329': 'Madriz (San José de Cusmapa)',
  // Matagalpa
  '361': 'Matagalpa (Cabecera)',
  '362': 'Matagalpa (San Ramón)',
  '363': 'Matagalpa (Matiguás)',
  '364': 'Matagalpa (Muy Muy)',
  '365': 'Matagalpa (Esquipulas)',
  '366': 'Matagalpa (San Dionisio)',
  '367': 'Matagalpa (San Isidro)',
  '368': 'Matagalpa (Sébaco)',
  '369': 'Matagalpa (Ciudad Darío)',
  '370': 'Matagalpa (Terrabona)',
  '371': 'Matagalpa (Río Blanco)',
  '372': 'Matagalpa (Tuma - La Dalia)',
  '373': 'Matagalpa (Rancho Grande)',
  // Masaya
  '401': 'Masaya (Cabecera)',
  '402': 'Masaya (Nindirí)',
  '403': 'Masaya (Tisma)',
  '404': 'Masaya (Catarina)',
  '405': 'Masaya (San Juan de Oriente)',
  '406': 'Masaya (Niquinohomo)',
  '407': 'Masaya (Nandasmo)',
  '408': 'Masaya (Masatepe)',
  '409': 'Masaya (La Concepción)',
  // Boaco
  '441': 'Boaco (Cabecera)',
  '442': 'Boaco (Camoapa)',
  '443': 'Boaco (Santa Lucía)',
  '444': 'Boaco (San José de los Remates)',
  '445': 'Boaco (San Lorenzo)',
  '446': 'Boaco (Teustepe)',
  // Nueva Segovia
  '481': 'Nueva Segovia (Ocotal)',
  '482': 'Nueva Segovia (Santa María)',
  '483': 'Nueva Segovia (Macuelizo)',
  '484': 'Nueva Segovia (Dipilto)',
  '485': 'Nueva Segovia (Ciudad Antigua)',
  '486': 'Nueva Segovia (Mozonte)',
  '487': 'Nueva Segovia (San Fernando)',
  '488': 'Nueva Segovia (El Jícaro)',
  '489': 'Nueva Segovia (Jalapa)',
  '490': 'Nueva Segovia (Murra)',
  '491': 'Nueva Segovia (Quilalí)',
  '492': 'Nueva Segovia (Wiwilí de Nueva Segovia)',
  // Rivas
  '521': 'Rivas (Cabecera)',
  '522': 'Rivas (San Jorge)',
  '523': 'Rivas (Buenos Aires)',
  '524': 'Rivas (Potosí)',
  '525': 'Rivas (Belén)',
  '526': 'Rivas (Tola)',
  '527': 'Rivas (San Juan del Sur)',
  '528': 'Rivas (Cárdenas)',
  '529': 'Rivas (Moyogalpa)',
  '530': 'Rivas (Altagracia)',
  // Río San Juan
  '561': 'Río San Juan (San Carlos)',
  '562': 'Río San Juan (El Castillo)',
  '563': 'Río San Juan (San Miguelito)',
  '564': 'Río San Juan (Morrito)',
  '565': 'Río San Juan (San Juan del Norte)',
  '566': 'Río San Juan (El Almendro)',
  // Costa Caribe Norte (RACCN)
  '601': 'RACCN (Puerto Cabezas / Bilwi)',
  '602': 'RACCN (Waspam)',
  '603': 'RACCN (Rosita)',
  '604': 'RACCN (Bonanza)',
  '605': 'RACCN (Siuna)',
  '606': 'RACCN (Waslala)',
  '616': 'RACCN (Mulukukú)',
  '619': 'RACCN (Prinzapolka)',
  // Costa Caribe Sur (RACCS)
  '621': 'RACCS (Bluefields)',
  '622': 'RACCS (El Rama)',
  '623': 'RACCS (Muelle de los Bueyes)',
  '624': 'RACCS (Nueva Guinea)',
  '626': 'RACCS (Kukra Hill)',
  '627': 'RACCS (Laguna de Perlas)',
  '628': 'RACCS (Corn Island)',
};

/** Formatea automáticamente la cédula: 001-280490-0001A */
export function formatearCedula(val: string): string {
  const v = val.trim();
  if (v.includes('-')) return v.toUpperCase();
  const limpio = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (limpio.length <= 3) return limpio;
  if (limpio.length <= 9) return `${limpio.slice(0, 3)}-${limpio.slice(3)}`;
  if (limpio.length <= 13) return `${limpio.slice(0, 3)}-${limpio.slice(3, 9)}-${limpio.slice(9)}`;
  return `${limpio.slice(0, 3)}-${limpio.slice(3, 9)}-${limpio.slice(9, 13)}${limpio.slice(13, 14)}`;
}

/** Formatea automáticamente el teléfono nicaragüense a 8 dígitos: XXXX-XXXX */
export function formatearTelefono(val: string): string {
  const v = val.trim();
  if (v.includes('-')) return v;
  const nums = v.replace(/\D/g, '');
  if (nums.length > 4 && nums.length <= 8) {
    return `${nums.slice(0, 4)}-${nums.slice(4)}`;
  }
  return v;
}

export interface DetalleCedula {
  valido: boolean;
  municipio: string;
  departamento: string;
  fechaNacimientoTexto?: string;
  edadAproximada?: number;
}

/** Desglosa los metadatos institucionales de la cédula nicaragüense */
export function desglosarCedula(cedula: string): DetalleCedula {
  const limpio = cedula.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (limpio.length < 9) {
    return {
      valido: false,
      municipio: 'N/A',
      departamento: 'N/A',
    };
  }

  const prefijo = limpio.slice(0, 3);
  const lugar = PREFIJOS_DEPARTAMENTOS[prefijo] ?? 'Nicaragua';
  const dep = lugar.split('(')[0].trim();
  const mun = lugar.includes('(') ? lugar.split('(')[1].replace(')', '').trim() : dep;

  // Fecha de nacimiento: DDMMAA
  const diaStr = limpio.slice(3, 5);
  const mesStr = limpio.slice(5, 7);
  const anioStr = limpio.slice(7, 9);

  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10);
  let anio = parseInt(anioStr, 10);

  let fechaTexto: string | undefined;
  let edad: number | undefined;

  if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && !isNaN(anio)) {
    const añoActualCorto = new Date().getFullYear() % 100;
    // Si anio > año actual, asumimos siglo pasado (19XX), sino 20XX
    const anioCompleto = anio > añoActualCorto ? 1900 + anio : 2000 + anio;
    const añoActual = new Date().getFullYear();
    edad = añoActual - anioCompleto;
    const meses = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];
    fechaTexto = `${dia} de ${meses[mes - 1]} de ${anioCompleto}`;
  }

  return {
    valido: limpio.length === 14,
    municipio: mun,
    departamento: dep,
    fechaNacimientoTexto: fechaTexto,
    edadAproximada: edad,
  };
}
