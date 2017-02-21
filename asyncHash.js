/**
 * Created by alexey.matveev on 17.02.2017.
 */
const
    fs = require('fs'),
    async = require('async'),
    //bunyan = require('bunyan'),
    crypto = require('crypto'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    moment = require('moment');
let qHashFile = async.queue((args,callback)=>{
    //объект для расчета контрольной суммы:
    const oHash = crypto.createHash('md5');
    //создать поток для чтения файла
    let rs = fs.createReadStream(args.filePath);
    rs.on('error',args.callback);
    rs.on('data',(data)=>{
        oHash.update(data);
    });
    rs.on('end',()=>{
        args.callback(null,oHash.digest('base64').replace(/=/g,''));
        callback();
    });
},16); //Максимальное количество одновременно расчитываемых контрольных сумм для файлов

let arrRecentlyCheckedFiles=[];

//получение атрибутов директории...
function getAttrDir (dirPath,callback) {
    fs.readdir(dirPath,(err,items)=>{
        if(err) return callback(err);
        //определяем атрибуты дочерних элементов
        let result = {
            size:0,
            type:'directory',
            filesCount:items.length,
            items:{},
        };
        let hashes = [];//массив из контрольных сумм дочерних элементов
        //для каждого файла из директории асинхронно выполняем указанную функцию
        //const fullItemPath = path.join(dirPath,itemName)
        async.each(items,(itemName,callback)=>{
            getAttrItem(path.join(dirPath,itemName),(err,attr)=>{
                if(err) return callback(err);
                //Считаем размер и записываем в результат
                result.size+= attr.size;
                //сохраняем объект
                result.items[path.join(dirPath,itemName)] = attr;
                //сохраняем хеш в массив хешей
                hashes.push(attr.hash);
                //идем дальше...
                callback();
            });
        },(err)=>{
            if(err) return callback(err);
            hashes.sort();//упорядочивание контрольных сумм...
            let oHash = crypto.createHash('md5');
            hashes.forEach((hash)=>{
                oHash.update(hash);
            });
            //хеш директории:
            result.hash = oHash.digest('base64').replace(/=/g,'');
            callback(null,result);
        })
    });
}

function getAttrItem(itemPath,callback) {

    fs.stat(itemPath,(err,stat)=>{
        if(err) return callback(err);
        if(stat.isDirectory())
        {
            getAttrDir(itemPath,callback);
        }
        else
        {
            console.log(itemPath);
            //добавить файл в очередь расчета контрольной суммы
            qHashFile.push({
                filePath:itemPath,
                callback:(err,hash)=>{
                    callback(err,{
                        size:stat.size,//размер
                        type:'file',
                        hash:hash,//контрольная сумма файла
                        mtime:stat.mtime.toISOString() //дата последнего изменения файла
                    });
                }
            },(err)=>{
                if(err) return callback(err);
            });
        }
    });
}
let filesArray=[];

/*fs.readFile('./out.json',(err,result1)=>{
    const my_object = JSON.parse(result1);
    extractFiles(my_object,null,(err,filesArr)=>{
        if(err) throw err;
        console.log(`files count ${filesArray.length}`);
    });
    //console.log(`result of opening file: ${result1}`);
});*/

getAttrDir('./appsrv/lib', (err, result) => {
    const dir = './appsrv/checksum';

    if (err) throw err;
    //async.parallel()
    //проверка на существование файла с данными.
    mkdirp(dir,(err)=>{
       fs.stat(`${dir}/out.json`,(err,stats)=>{
           if(err) {
               if (err.code = 'ENOENT') {
                   console.log('[STATS]:no file out.json : creating one...');
                   fs.writeFile(`${dir}/out.json`, JSON.stringify(result), (err) => {
                       if (err) {
                           console.log(`[STATS]:error saving file: ${err}`);
                       }
                       else {
                           console.log(`[STATS]:file saved: ${err}`);
                       }
                       //FILE WAS SAVED
                       //сохраняем файл и выходим, ничего не сравнивая
                   });
               }
           }
           else {
               //файл out.json есть
               //сравниваем содержимое файла и того, что мы только что считали.
               async.parallel([
                       (cb)=>{
                           //вынимаем все 'файлы' из файла, который есть на диске
                           //# прошлый снимок
                           fs.readFile(`${dir}/out.json`, (err, result1) => {
                               const my_object = JSON.parse(result1);
                               //преобразовываем его в нужный нам объект:
                               extractFromJSON(my_object,cb);
                               //console.log(`result of opening file: ${result1}`);
                           });
                       },
                       (cb)=>{
                           //вынимаем все 'файлы' из текущего анализа
                           //# текущий снимок
                           extractFromJSON(result,cb);
                       }
                   ],
                   (err,results)=>{
                   //console.log('aaaaaaaaaaaa');
                   const resObject= {
                       new_files: [],
                       modyfied_files: [],
                       deleted_files:[]
                   };
                   //сравниваем результирующие массивы:
                       results[0].forEach((item,index,arr)=>{
                           const found = results[1].find((element)=>{
                               if(element.path===item.path)
                               {
                                   return true;
                               }
                           });
                           if(found)
                           {
                               //нашли элемент в текущем снимке, сравниваем 2 снимка
                               //let str = `file ${item.path} modyfied by:`;
                               if(item.hash===found.hash)
                               {
                                   //файл не был изменен.
                               }
                               else
                               {
                                   if(!(item.mtime===found.mtime)) {
                                       //файл был изменен - помещаем в объект для оповещения пользователя об этом
                                       resObject.modyfied_files.push(found.path);
                                   }
                               }
                           }
                           else
                           {
                               //в прошлом снимке есть, в текущем - не найдено => файл был удален
                                resObject.deleted_files.push(item.path);
                           }
                       });
                       results[1].forEach((item,index,arr)=>{
                           //теперь ищем измененные файлы, делая для каждого элемента нового снимка поиск в старом
                           //если не найдено => файл новый
                           const found = results[0].find((element)=>{
                               if(element.path===item.path)
                               {
                                   return true;
                               }
                           });
                           if(!found)
                           {
                               //заносим новый файл в список
                               resObject.new_files.push(item.path);
                           }

                       });

                       //сохраняем файл с изменениями и out.json
                       //#hardcode
                       fs.writeFile('./appsrv/checksum/shortLog.json',`{"${moment().format('MMMM Do YYYY, h:mm:ss a')}": \r\n ${JSON.stringify(resObject)} }`,(err,res)=>{
                           if(err) throw err;
                           //сохраняем новый снимок, перезаписывая старый
                           fs.writeFile('./appsrv/checksum/out.json',JSON.stringify(result),(err,res)=> {
                               if (err) throw err;
                               console.log(`{Урра, все записано!} ${res}`);
                           });
                       });

                       /*fs.writeFile(JSON.stringify(results),(err,res)=>{
                           if(err) throw err;
                           console.log(`{Урра!} ${res}`);
                       });*/
                   });
           }

       });
    });

    fs.stat(dir,(err,stats)=>{
        if(err)
        {
            if(err.code='ENOENT');
            {
                console.log('[STATS-1]:no directory: creating one...');
                fs.mkdirSync(dir,)
            }
            //создаем данный файл, создаем результирующий файл
            fs.stat('./appsrv/checksum/out.json',(err,result)=>{

            });
        }
        console.log(stats);
    });
    /*extractFromJSON(result,(err, result2)=>{
        if(err) throw err;
        console.log(`[extractFrom JSON]: the result of opening and analyzing files: count-> ${result2.length} 1st elem: ${result2[0]} overall length:${result.size} bytes`);

    });*/


    /*fs.readFile('./appsrv/out.json', (err, result1) => {
        const my_object = JSON.parse(result1);

        //console.log(`result of opening file: ${result1}`);
    });

    fs.writeFile('./out.json', JSON.stringify(result), (err, result2) => {
        if (err) throw err;
        console.log(`result of saving file: ${result2}`);
    });*/
    //console.log(result);
});


//взять файлы из объекта JSON
const extractFromJSON = (_object_,_callback_)=>
{
    let filesArray=[];
    const extractFiles = (_object,path,_callback)=>{
        //for()
        if((_object.type=='directory')&&(_object.items))
        {
            //идем вглубь
            for(let key in _object.items)
            {
                extractFiles(_object.items[key],key,(err)=>{if(err) return _callback(err)});
            }
        }
        else if(_object.type=='file')
        {
            _object.path=path;
            filesArray.push(_object);
        }
        else {
            _callback(new Error("Error!!!"));
        }
        _callback(null,filesArray);
    };
    return extractFiles(_object_,null,_callback_);
};




const findChangedFiles=(input_object_old,input_object_new,callback)=>{
    let changedFiles=[];
    //у каждого объекта вынимаем все названия файлов
    async.parallel([
            (cb)=>{
                //вынимаем все файлы из object_old

            },
            (cb)=>{
                //вынимаем все файлы из object_new
            }
        ],
        (err,results)=>{});
}


class CheckFiles
{
    constructor(dir)
    {
        this.dir=dir;
        this.FilesInfoJSON={};
    }
    run()
    {
        //получаем атрибуты директории
        getAttrDir('./appsrv',(err,result)=>{
            if(err) throw err;
            //формируем файл json

        });
    }
}
