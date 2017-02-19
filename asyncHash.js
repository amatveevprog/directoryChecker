/**
 * Created by alexey.matveev on 17.02.2017.
 */
const
    fs = require('fs'),
    async = require('async'),
    //bunyan = require('bunyan'),
    crypto = require('crypto'),
    path = require('path');
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
fs.readFile('./out.json',(err,result1)=>{
    const my_object = JSON.parse(result1);
    extractFiles(my_object,null,(err,filesArr)=>{
        if(err) throw err;
       console.log(`files count ${filesArray.length} \r\n ${JSON.stringify(filesArr)}`);
    });
    //console.log(`result of opening file: ${result1}`);
});
/*getAttrDir('./1',(err,result)=>{
    if(err) throw err;
    /!*fs.readFile('./appsrv/out.json',(err,result1)=>{
        const my_object = JSON.parse(result1);
        console.log(`result of opening file: ${result1}`);
    });*!/
    fs.writeFile('./out.json',JSON.stringify(result),(err,result2)=>{
        if(err) throw err;
        console.log(`result of saving file: ${result2}`);
    });
    //console.log(result);
});*/

const extractFiles = (_object,path,_callback)=>{
    //for()
    if((_object.type=='directory')&&(_object.items))
    {
       //идем вглубь
        /*_object.items.forEach((item)=>{
            extractFiles(item,(err)=>{if(err) return _callback(err)});
        });*/
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
